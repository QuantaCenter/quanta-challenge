import {
   DEVICE_CODE_GRANT_TYPE,
   DEVICE_CODE_SLOW_DOWN_SECONDS,
   DEVICE_FLOW_CLIENT_ID,
   DEVICE_FLOW_ERRORS,
   DEVICE_FLOW_PATHS,
   DEVICE_FLOW_SCOPE,
   type DeviceAuthorizationResponse,
   type DeviceTokenResponse,
} from '@challenge/shared/oauth';

import { CliError, PrecheckError } from '../core/errors';
import type { Logger } from '../core/logger';
import { sleep } from '../utils/async';
import { CLI_VERSION } from '../version';

export interface DeviceFlowOptions {
   baseUrl: string;
   fetch: typeof globalThis.fetch;
   logger: Logger;
   signal?: AbortSignal;
   timeoutMs?: number;
   /** 覆盖轮询间隔（秒），仅测试用；正常流程遵循服务端下发的 interval */
   overrideIntervalSeconds?: number;
}

export interface DeviceFlowResult {
   tokens: DeviceTokenResponse;
   /** 供 UI 展示 */
   userCode: string;
   verificationUri: string;
}

/** 设备授权 + 轮询换 token（RFC 8628 §3.1 → §3.5） */
export interface DeviceFlow {
   requestCodes(): Promise<DeviceAuthorizationResponse>;
   pollForToken(
      auth: DeviceAuthorizationResponse,
      onPending?: (elapsedMs: number) => void,
   ): Promise<DeviceTokenResponse>;
}

interface OAuthErrorBody {
   error?: string;
   error_description?: string;
}

const postForm = async (
   options: DeviceFlowOptions,
   path: string,
   body: Record<string, string>,
): Promise<{ status: number; json: unknown }> => {
   const timeoutMs = options.timeoutMs ?? 15_000;
   const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);

   let response: Response;
   try {
      response = await options.fetch(`${options.baseUrl}${path}`, {
         method: 'POST',
         headers: {
            // RFC 8628 §3.1 要求 x-www-form-urlencoded；服务端为兼容也收 JSON，
            // 但这里按规范发送，避免依赖服务端的宽松解析。
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
            'user-agent': `qpc/${CLI_VERSION} (quanta-problem-creator)`,
         },
         body: new URLSearchParams(body).toString(),
         signal,
      });
   } catch (error) {
      throw new CliError(`无法连接 ${options.baseUrl}${path}`, {
         cause: error,
         hint: '确认 API 地址正确且服务已启动：qpc doctor',
      });
   }

   const text = await response.text();
   let json: unknown;
   try {
      json = text ? JSON.parse(text) : undefined;
   } catch {
      json = undefined;
   }
   return { status: response.status, json };
};

export const createDeviceFlow = (options: DeviceFlowOptions): DeviceFlow => {
   const requestCodes = async (): Promise<DeviceAuthorizationResponse> => {
      const { status, json } = await postForm(
         options,
         DEVICE_FLOW_PATHS.deviceAuthorization,
         { client_id: DEVICE_FLOW_CLIENT_ID, scope: DEVICE_FLOW_SCOPE },
      );

      const body = json as
         | (Partial<DeviceAuthorizationResponse> & OAuthErrorBody)
         | undefined;
      if (status !== 200 || !body?.device_code || !body.user_code) {
         throw new CliError(`服务端拒绝了设备授权请求（HTTP ${status}）`, {
            details: { body: body ?? null },
            hint:
               body?.error === 'invalid_client'
                  ? '服务端不认识本客户端的 client_id，确认 CLI 与服务端版本一致。'
                  : '检查 API 地址是否指向 quanta-challenge 应用（而非其它服务）。',
         });
      }

      return {
         device_code: body.device_code,
         user_code: body.user_code,
         verification_uri: body.verification_uri ?? '',
         verification_uri_complete: body.verification_uri_complete ?? '',
         // RFC §3.2：interval 缺省时客户端必须按 5 秒处理
         interval: body.interval ?? 5,
         expires_in: body.expires_in ?? 600,
      };
   };

   const pollForToken = async (
      auth: DeviceAuthorizationResponse,
      onPending?: (elapsedMs: number) => void,
   ): Promise<DeviceTokenResponse> => {
      // RFC §3.5：每次收到 slow_down 都必须把间隔**累加** 5 秒，
      // 且对后续请求持续生效 —— 不能只在那一轮临时加大。
      let intervalMs =
         (options.overrideIntervalSeconds ?? auth.interval) * 1_000;
      const deadline = Date.now() + auth.expires_in * 1_000;
      const startedAt = Date.now();
      let consecutiveNetworkErrors = 0;

      for (;;) {
         if (Date.now() >= deadline) {
            throw new CliError('设备授权码已过期', {
               hint: '重新执行 `qpc login` 会生成新的验证码。',
            });
         }

         let status: number;
         let body: (Partial<DeviceTokenResponse> & OAuthErrorBody) | undefined;
         try {
            const result = await postForm(
               options,
               DEVICE_FLOW_PATHS.deviceToken,
               {
                  grant_type: DEVICE_CODE_GRANT_TYPE,
                  device_code: auth.device_code,
                  client_id: DEVICE_FLOW_CLIENT_ID,
               },
            );
            status = result.status;
            body = result.json as typeof body;
            consecutiveNetworkErrors = 0;
         } catch (error) {
            // RFC §3.5：连接超时后客户端必须**单向降低**轮询频率，
            // 推荐指数退避。否则服务端抖动时客户端会持续加压。
            consecutiveNetworkErrors += 1;
            intervalMs *= 2;
            options.logger.warn(
               `轮询失败（第 ${consecutiveNetworkErrors} 次），间隔调整为 ${Math.round(intervalMs / 1000)} 秒`,
            );
            if (consecutiveNetworkErrors >= 5) throw error;
            await sleep(intervalMs, options.signal);
            continue;
         }

         if (status === 200 && body?.access_token && body.refresh_token) {
            return {
               access_token: body.access_token,
               refresh_token: body.refresh_token,
               token_type: 'Bearer',
               expires_in: body.expires_in ?? 900,
               scope: body.scope ?? DEVICE_FLOW_SCOPE,
            };
         }

         const error = body?.error;
         if (error === DEVICE_FLOW_ERRORS.authorizationPending) {
            onPending?.(Date.now() - startedAt);
         } else if (error === DEVICE_FLOW_ERRORS.slowDown) {
            intervalMs += DEVICE_CODE_SLOW_DOWN_SECONDS * 1_000;
            options.logger.detail(
               `服务端要求降低轮询频率，间隔调整为 ${Math.round(intervalMs / 1000)} 秒`,
            );
         } else if (error === DEVICE_FLOW_ERRORS.accessDenied) {
            throw new PrecheckError('授权被拒绝', {
               hint: '你在确认页点击了拒绝；重新执行 `qpc login` 可再试一次。',
            });
         } else if (error === DEVICE_FLOW_ERRORS.expiredToken) {
            throw new CliError('设备授权码已失效（可能已被使用）', {
               hint: '重新执行 `qpc login`。',
            });
         } else {
            throw new CliError(
               `换令牌失败${error ? `：${error}` : `（HTTP ${status}）`}`,
               {
                  details: {
                     status,
                     error: body?.error,
                     description: body?.error_description,
                  },
               },
            );
         }

         await sleep(intervalMs, options.signal);
      }
   };

   return { requestCodes, pollForToken };
};
