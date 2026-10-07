import {
   DEVICE_CODE_GRANT_TYPE,
   DEVICE_FLOW_CLIENT_ID,
   DEVICE_FLOW_PATHS,
   formatUserCode,
   isValidUserCode,
   normalizeUserCode,
   USER_CODE_ALPHABET,
} from '@challenge/shared/oauth';
import { describe, expect, it } from 'vitest';
import { CliError, PrecheckError } from '../../src/core/errors';
import { createLogger } from '../../src/core/logger';
import { createDeviceFlow } from '../../src/services/device-flow';
import { createFakeApi } from '../helpers/fake-api';

const silent = createLogger({ level: 'silent', json: false, color: false });

const baseOptions = (fetch: ReturnType<typeof createFakeApi>['fetch']) => ({
   baseUrl: 'http://localhost:3000',
   fetch: fetch as typeof globalThis.fetch,
   logger: silent,
   overrideIntervalSeconds: 0.001,
});

const authResponse = {
   device_code: 'device-abc',
   user_code: 'WDJB-MJHT',
   verification_uri: 'https://x/auth/device',
   verification_uri_complete: 'https://x/auth/device?user_code=WDJB-MJHT',
   expires_in: 600,
   interval: 5,
};

describe('共享的 user_code 归一化（两端必须一致）', () => {
   it('接受带横线/空格/小写/易混字符的输入', () => {
      // 这些都是用户实际会输入或粘贴的形态，全部应归一化到同一个码
      for (const input of [
         'WDJB-MJHT',
         'wdjb-mjht',
         '  WDJB MJHT  ',
         'WDJB—MJHT',
         'WDJB0MJHT', // 0 不在字符集，被剔除
      ]) {
         const normalized = normalizeUserCode(input);
         expect(normalized, input).toBe('WDJBMJHT');
         expect(isValidUserCode(normalized), input).toBe(true);
      }
   });

   it('长度不足或含非法结构时判为非法', () => {
      expect(isValidUserCode(normalizeUserCode('WDJBMJH'))).toBe(false);
      expect(isValidUserCode('')).toBe(false);
   });

   it('格式化只用于展示，不改变校验结果', () => {
      expect(formatUserCode('WDJBMJHT')).toBe('WDJB-MJHT');
      expect(normalizeUserCode(formatUserCode('WDJBMJHT'))).toBe('WDJBMJHT');
   });

   it('字符集是 RFC 8628 §6.1 的 base20（无元音、无易混字符）', () => {
      expect(USER_CODE_ALPHABET).toBe('BCDFGHJKLMNPQRSTVWXZ');
      expect(USER_CODE_ALPHABET).toHaveLength(20);
      // RFC 原文给出的集合里有 L（它剔掉了 I 但保留了 L）。
      // 因此这里只断言"没有元音、没有 0/1 这两个易混数字"，
      // 不能想当然地把 L 也当作易混字符剔掉 —— 那会与规范不符。
      for (const char of 'AEIOU01') {
         expect(USER_CODE_ALPHABET.includes(char), `不应包含 ${char}`).toBe(
            false,
         );
      }
      for (const char of 'BCDFGHJKLMNPQRSTVWXZ') {
         expect(USER_CODE_ALPHABET.includes(char), `应包含 ${char}`).toBe(true);
      }
   });
});

describe('CLI 设备码流程', () => {
   it('按规范发送 form 编码请求并解析响应', async () => {
      const api = createFakeApi({
         [`POST ${DEVICE_FLOW_PATHS.deviceAuthorization}`]: () => ({
            body: authResponse,
         }),
      });
      const flow = createDeviceFlow(baseOptions(api.fetch));

      const auth = await flow.requestCodes();

      expect(auth.device_code).toBe('device-abc');
      expect(auth.user_code).toBe('WDJB-MJHT');
      expect(api.requests[0]?.headers['content-type']).toBe(
         'application/x-www-form-urlencoded',
      );
      // 请求体是 form 编码的 client_id + scope
      expect(api.requests[0]?.body).toContain(
         `client_id=${DEVICE_FLOW_CLIENT_ID}`,
      );
   });

   it('authorization_pending → 继续轮询直到 approved', async () => {
      let polls = 0;
      const api = createFakeApi({
         [`POST ${DEVICE_FLOW_PATHS.deviceToken}`]: () => {
            polls += 1;
            if (polls < 3) {
               return { status: 400, body: { error: 'authorization_pending' } };
            }
            return {
               body: {
                  access_token: 'at',
                  refresh_token: 'rt',
                  token_type: 'Bearer',
                  expires_in: 900,
                  scope: 'problem:write',
               },
            };
         },
      });
      const flow = createDeviceFlow(baseOptions(api.fetch));

      const tokens = await flow.pollForToken(authResponse);
      expect(tokens.access_token).toBe('at');
      expect(polls).toBe(3);
      // grant_type 必须是 RFC 8628 规定的 URN，不能用 authorization_code
      expect(api.requests[0]?.body).toContain(
         `grant_type=${encodeURIComponent(DEVICE_CODE_GRANT_TYPE)}`,
      );
   });

   it('slow_down → 轮询间隔累加 5 秒且对后续请求持续生效（RFC §3.5）', async () => {
      const seenAt: number[] = [];
      let polls = 0;
      const api = createFakeApi({
         [`POST ${DEVICE_FLOW_PATHS.deviceToken}`]: () => {
            seenAt.push(Date.now());
            polls += 1;
            return polls === 1
               ? { status: 400, body: { error: 'slow_down' } }
               : {
                    body: {
                       access_token: 'at',
                       refresh_token: 'rt',
                       token_type: 'Bearer',
                       expires_in: 900,
                       scope: 's',
                    },
                 };
         },
      });
      // 起始间隔 1ms；slow_down 后应变成 5s+1ms。
      // 这里用真实时间断言"确实变长了"，而不是只看日志。
      const flow = createDeviceFlow({
         ...baseOptions(api.fetch),
         overrideIntervalSeconds: 0.001,
      });

      const started = Date.now();
      await flow.pollForToken(authResponse);
      const elapsed = Date.now() - started;

      expect(polls).toBe(2);
      // 第二次请求至少要等 ~5 秒（5001ms）。给它一点容差。
      expect(elapsed).toBeGreaterThan(4_900);
      void seenAt;
   }, 15_000);

   it('access_denied → 立即停止轮询并抛 PrecheckError', async () => {
      const api = createFakeApi({
         [`POST ${DEVICE_FLOW_PATHS.deviceToken}`]: () => ({
            status: 400,
            body: { error: 'access_denied' },
         }),
      });
      const flow = createDeviceFlow(baseOptions(api.fetch));

      await expect(flow.pollForToken(authResponse)).rejects.toBeInstanceOf(
         PrecheckError,
      );
      // 只请求一次：不能继续轮询一个已被拒绝的授权
      expect(api.requests).toHaveLength(1);
   });

   it('expired_token → 抛出可操作的错误', async () => {
      const api = createFakeApi({
         [`POST ${DEVICE_FLOW_PATHS.deviceToken}`]: () => ({
            status: 400,
            body: { error: 'expired_token' },
         }),
      });
      const flow = createDeviceFlow(baseOptions(api.fetch));

      await expect(flow.pollForToken(authResponse)).rejects.toThrow(
         /失效|过期/,
      );
   });

   it('未知 client_id 时给出可诊断的错误', async () => {
      const api = createFakeApi({
         [`POST ${DEVICE_FLOW_PATHS.deviceAuthorization}`]: () => ({
            status: 400,
            body: { error: 'invalid_client' },
         }),
      });
      const flow = createDeviceFlow(baseOptions(api.fetch));

      const error = (await flow.requestCodes().catch((e) => e)) as CliError;
      expect(error).toBeInstanceOf(CliError);
      expect(error.hint).toContain('client_id');
   });
});
