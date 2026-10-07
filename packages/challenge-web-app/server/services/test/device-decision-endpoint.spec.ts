import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_FLOW_CLIENT_ID, formatUserCode } from '@challenge/shared/oauth';

import { createDeviceFlowService } from '../device-flow';
import { createRedisDouble, type RedisDouble } from '~~/server/utils/test/redis-double';

const redisHolder: { current: RedisDouble | null } = { current: null };
vi.mock('~~/server/utils/redis', () => ({
   useRedis: () => {
      if (!redisHolder.current) throw new Error('测试未初始化 Redis 替身');
      return redisHolder.current;
   },
}));

/**
 * 确认端点（decision.post.ts）的 CSRF 契约。
 *
 * 这是最需要防 CSRF 的写操作：一旦被绕过，攻击者可诱导已登录用户
 * 把账号授权给攻击者的设备。因此直接测端点处理器本身 ——
 * 只测 service 层证明不了这件事，因为 service 根本不知道 CSRF 的存在。
 *
 * 端点是 Nitro 的 auto-import 风格（defineEventHandler / getCookie / readBody
 * 均来自全局），所以这里把用到的辅助函数 stub 成最小可用实现。
 */
interface TestEvent {
   path: string;
   method: string;
   status?: number;
   cookies: Record<string, string>;
   headers: Record<string, string>;
   body: Record<string, unknown>;
}

let currentEvent: TestEvent | null = null;

const responseHeaders: Record<string, unknown> = {};

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn);
vi.stubGlobal('getCookie', (_e: TestEvent, name: string) => currentEvent?.cookies[name]);
vi.stubGlobal(
   'getHeader',
   (_e: TestEvent, name: string) => currentEvent?.headers[name],
);
vi.stubGlobal('readBody', async () => currentEvent?.body ?? {});
// jwt.ts 通过 useRuntimeConfig().secret 取过期时间；密钥本身优先读 process.env
// （见 server/utils/jwt.ts 的 runtimeSecret 说明），这里把两者都提供，
// 让签发/校验走仓库真实实现，而不是 mock 掉 verifyToken。
vi.stubGlobal('useRuntimeConfig', () => ({
   secret: {
      accessToken: 'dev_only_ACCESS_TOKEN_SECRET',
      refreshToken: 'dev_only_REFRESH_TOKEN_SECRET',
      accessTokenExpiresIn: '15m',
      refreshTokenExpiresIn: '7d',
   },
   public: { appBaseUrl: 'http://localhost:3000' },
}));
process.env.ACCESS_TOKEN_SECRET ||= 'dev_only_ACCESS_TOKEN_SECRET';
process.env.REFRESH_TOKEN_SECRET ||= 'dev_only_REFRESH_TOKEN_SECRET';
vi.stubGlobal('setResponseStatus', (_e: TestEvent, code: number) => {
   if (currentEvent) currentEvent.status = code;
});
vi.stubGlobal('setHeader', (_e: TestEvent, name: string, value: unknown) => {
   responseHeaders[name] = value;
});

const makeEvent = (options: {
   cookies: Record<string, string>;
   headers?: Record<string, string>;
   body?: Record<string, unknown>;
}): TestEvent => {
   currentEvent = {
      path: '/api/oauth/device/decision',
      method: 'POST',
      cookies: options.cookies,
      headers: options.headers ?? {},
      body: options.body ?? {},
   };
   return currentEvent;
};

const loadHandler = async () => {
   const module = await import('~~/server/api/oauth/device/decision.post');
   // 端点声明的是 Nitro 的 EventHandler 类型，与我们伪造的最小 TestEvent 不重叠。
   // 先转 unknown 再断言，避免 TS 因为"两者不兼容"直接拒编译。
   return module.default as unknown as (
      event: TestEvent,
   ) => Promise<Record<string, unknown>>;
};

/** 用仓库真实的签发逻辑造 access token，避免手写 payload 与实现漂移 */
const accessTokenFor = async (userId = 'user-1'): Promise<string> => {
   const { generateTokens } = await import('~~/server/utils/jwt');
   return generateTokens({ userId, role: 'ADMIN' as never }).accessToken;
};

describe('设备授权确认端点（CSRF 与状态迁移）', () => {
   let redis: RedisDouble;
   let service: ReturnType<typeof createDeviceFlowService>;
   let issued: { deviceCode: string; userCode: string };
   let handler: Awaited<ReturnType<typeof loadHandler>>;
   let accessToken: string;

   beforeEach(async () => {
      redisHolder.current = createRedisDouble({ current: Date.now() });
      service = createDeviceFlowService();
      issued = await service.authorize({ clientId: DEVICE_FLOW_CLIENT_ID });
      handler = await loadHandler();
      accessToken = await accessTokenFor();
   });

   afterEach(() => {
      redisHolder.current = null;
      currentEvent = null;
      vi.resetModules();
   });

   const approveEvent = (overrides: Partial<Parameters<typeof makeEvent>[0]> = {}) =>
      makeEvent({
         cookies: {
            quanta_access_token: accessToken,
            quanta_csrf_token: 'csrf-1',
         },
         headers: { 'x-csrf-token': 'csrf-1' },
         body: { user_code: formatUserCode(issued.userCode), action: 'approve' },
         ...overrides,
      });

   it('缺少 CSRF 头时拒绝，且不会完成授权', async () => {
      const event = approveEvent({ headers: {} });

      const result = await handler(event);

      expect(result.error).toBe('csrf_failed');
      // 关键：不能因为 CSRF 失败就悄悄把会话改掉
      const session = await service.findByUserCode(issued.userCode);
      expect(session?.status).toBe('pending');
   });

   it('CSRF 头与 cookie 不一致时拒绝', async () => {
      const result = await handler(
         approveEvent({ headers: { 'x-csrf-token': 'csrf-2' } }),
      );
      expect(result.error).toBe('csrf_failed');
   });

   it('未登录时拒绝（即使 CSRF 正确）', async () => {
      const result = await handler(
         approveEvent({
            cookies: { quanta_csrf_token: 'csrf-1' },
            headers: { 'x-csrf-token': 'csrf-1' },
         }),
      );
      expect(result.error).toBe('unauthorized');
   });

   it('CSRF 通过时完成批准并绑定当前用户', async () => {
      const result = await handler(approveEvent());

      expect(result.status).toBe('approved');
      const session = await service.findByUserCode(issued.userCode);
      expect(session?.status).toBe('approved');
      expect(session?.userId).toBe('user-1');
   });

   it('拒绝时状态转 denied', async () => {
      const result = await handler(
         approveEvent({
            body: { user_code: formatUserCode(issued.userCode), action: 'deny' },
         }),
      );
      expect(result.status).toBe('denied');
   });

   it('已批准的会话不能被第二个账号改绑', async () => {
      await handler(approveEvent());

      const secondToken = await accessTokenFor('attacker');
      const second = await handler(
         approveEvent({
            cookies: {
               quanta_access_token: secondToken,
               quanta_csrf_token: 'csrf-1',
            },
         }),
      );

      expect(second.error).toBe('invalid_state');
      const session = await service.findByUserCode(issued.userCode);
      expect(session?.userId).toBe('user-1');
   });

   it('action 非法时按无效请求处理', async () => {
      const result = await handler(
         approveEvent({
            body: { user_code: formatUserCode(issued.userCode), action: 'whatever' },
         }),
      );
      expect(result.error).toBe('invalid_request');
   });
});
