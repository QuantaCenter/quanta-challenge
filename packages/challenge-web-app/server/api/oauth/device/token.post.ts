import {
   DEVICE_CODE_GRANT_TYPE,
   DEVICE_FLOW_CLIENT_ID,
} from '@challenge/shared/oauth';
import z from 'zod';

import { createDeviceFlowService, statusToError } from '~~/server/services/device-flow';
import { generateTokens } from '~~/server/utils/jwt';
import { logger } from '~~/lib/logger';
import prisma from '~~/lib/prisma';

/**
 * RFC 8628 §3.4 令牌端点：CLI 用 device_code 轮询换取 token。
 *
 * ⚠️ 这个端点**故意不做 cookie / csrf 鉴权**。
 * 它的鉴权凭据就是 `device_code` 本身（高熵随机串，只有发起授权的 CLI 知道），
 * 而调用方是**没有浏览器会话的 CLI**。如果按仓库其它写入接口的惯例给它加上
 * `x-csrf-token` 校验，设备码流程会直接失效 —— 这正是当初设计时要避开的坑，
 * 所以在此显式说明。
 *
 * 换来的 token 直接放在响应体里（不复用 cookie 通道）：CLI 会自己保存到
 * ~/.config 下的 0600 文件，全程不经过浏览器。
 */
const BodySchema = z.object({
   grant_type: z.string().min(1),
   device_code: z.string().min(1),
   client_id: z.string().min(1),
});

/** RFC 6749 §5.2 的错误响应 */
const oauthError = (
   event: Parameters<Parameters<typeof defineEventHandler>[0]>[0],
   error: string,
   description: string,
   status = 400,
) => {
   setResponseStatus(event, status);
   setHeader(event, 'cache-control', 'no-store');
   return { error, error_description: description };
};

export default defineEventHandler(async (event) => {
   const traceId = getHeader(event, 'x-trace-id') ?? 'unknown';

   const raw = await readBody<Record<string, unknown>>(event).catch(
      () => ({}) as Record<string, unknown>,
   );
   const parsed = BodySchema.safeParse({
      grant_type: typeof raw.grant_type === 'string' ? raw.grant_type : undefined,
      device_code: typeof raw.device_code === 'string' ? raw.device_code : undefined,
      client_id: typeof raw.client_id === 'string' ? raw.client_id : undefined,
   });

   if (!parsed.success) {
      return oauthError(event, 'invalid_request', 'grant_type, device_code and client_id are required');
   }

   const { grant_type, device_code, client_id } = parsed.data;
   if (grant_type !== DEVICE_CODE_GRANT_TYPE) {
      return oauthError(
         event,
         'unsupported_grant_type',
         `expected ${DEVICE_CODE_GRANT_TYPE}`,
      );
   }
   if (client_id !== DEVICE_FLOW_CLIENT_ID) {
      return oauthError(event, 'invalid_client', 'unknown client_id');
   }

   const service = createDeviceFlowService();
   const session = await service.consume(device_code, client_id);

   // 会话不存在（过期、被清理、或被别人消费后清除）
   if (!session) {
      return oauthError(
         event,
         'expired_token',
         'device_code is invalid or has expired',
      );
   }

   const pendingError = statusToError(session.status);
   if (pendingError === 'authorization_pending') {
      // RFC §3.5：这是正常轮询状态，用 400 + error 表达（与各实现一致）
      return oauthError(
         event,
         'authorization_pending',
         'the user has not yet approved this request',
      );
   }
   if (pendingError === 'access_denied') {
      return oauthError(event, 'access_denied', 'the user denied this request');
   }
   if (pendingError === 'expired_token') {
      return oauthError(
         event,
         'expired_token',
         'this device_code was already used or has expired',
      );
   }

   if (!session.userId) {
      // 走到这里说明状态是 approved 但没绑定用户，属于内部不一致
      logger.error({ traceId, deviceCode: device_code }, '设备会话状态不一致');
      return oauthError(event, 'server_error', 'inconsistent device session', 500);
   }

   // 角色以**数据库**为准：用户可能在授权期间被降权。
   // 与 renewTokens() 的策略保持一致（见 server/utils/jwt.ts 的说明）。
   const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, role: true },
   });
   if (!user) {
      return oauthError(event, 'access_denied', 'the authorizing user no longer exists');
   }

   const tokens = generateTokens({ userId: user.id, role: user.role });

   setResponseStatus(event, 200);
   setHeader(event, 'cache-control', 'no-store');
   setHeader(event, 'pragma', 'no-cache');

   logger.info(
      { traceId, userId: user.id, role: user.role, scope: session.scope },
      '设备码流程已签发令牌',
   );

   return tokens_response(tokens, session.scope);
});

/** RFC 6749 §5.1 令牌响应 */
const tokens_response = (
   tokens: { accessToken: string; refreshToken: string },
   scope: string,
) => ({
   access_token: tokens.accessToken,
   refresh_token: tokens.refreshToken,
   token_type: 'Bearer' as const,
   // 与 nuxt.config 的 accessTokenExpiresIn 默认值（15m）对应；
   // CLI 主要用它来决定何时提前续期。
   expires_in: 900,
   scope,
});
