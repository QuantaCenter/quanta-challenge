import { z } from 'zod';

import { createDeviceFlowService } from '~~/server/services/device-flow';
import { verifyToken } from '~~/server/utils/jwt';
import { logger } from '~~/lib/logger';

/**
 * 用户在确认页点击"同意/拒绝"。
 *
 * 与 token 端点不同，这里**必须**是会话鉴权 + CSRF 校验：
 * 它代表"已登录用户把自己的账号授权给某个设备"，是最需要防 CSRF 的写操作 ——
 * 否则攻击者可以构造页面诱导登录用户提交表单，把 victim 的账号授权给攻击者的设备。
 *
 * CSRF 校验沿用仓库既有约定（server/trpc/context.ts 的双提交模式）：
 * cookie 里的 quanta_csrf_token 必须与 x-csrf-token 头一致。
 */
const BodySchema = z.object({
   user_code: z.string().min(1),
   action: z.enum(['approve', 'deny']),
});

export default defineEventHandler(async (event) => {
   const traceId = getHeader(event, 'x-trace-id') ?? 'unknown';

   const token = getCookie(event, 'quanta_access_token');
   let user: { userId: string; role: string } | null = null;
   try {
      user = token ? verifyToken(token) : null;
   } catch {
      user = null;
   }
   if (!user) {
      setResponseStatus(event, 401);
      return { error: 'unauthorized', error_description: '请先登录' };
   }

   // CSRF：cookie 与请求头必须一致
   const csrfCookie = getCookie(event, 'quanta_csrf_token');
   const csrfHeader = getHeader(event, 'x-csrf-token');
   if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      logger.warn({ traceId, path: event.path }, 'OAuth 确认页 CSRF 校验失败');
      setResponseStatus(event, 403);
      return { error: 'csrf_failed', error_description: 'CSRF 校验失败，请刷新页面重试' };
   }

   const raw = await readBody<Record<string, unknown>>(event).catch(
      () => ({}) as Record<string, unknown>,
   );
   const parsed = BodySchema.safeParse({
      user_code: typeof raw.user_code === 'string' ? raw.user_code : undefined,
      action: raw.action,
   });
   if (!parsed.success) {
      setResponseStatus(event, 400);
      return { error: 'invalid_request' };
   }

   const service = createDeviceFlowService();
   const { user_code, action } = parsed.data;

   if (action === 'deny') {
      const denied = await service.deny(user_code);
      if (!denied) {
         setResponseStatus(event, 404);
         return { error: 'not_found', error_description: '验证码不存在或已过期' };
      }
      logger.info({ traceId, userId: user.userId }, '用户拒绝了设备授权');
      return { status: 'denied' };
   }

   const approved = await service.approve(user_code, user.userId);

   if (approved.outcome === 'not_found') {
      const remaining = await service.registerFailedAttempt(user_code);
      setResponseStatus(event, remaining <= 0 ? 429 : 404);
      return {
         error: remaining <= 0 ? 'too_many_attempts' : 'not_found',
         error_description: '验证码不存在或已过期',
         attempts_remaining: remaining,
      };
   }

   if (approved.outcome === 'already_decided') {
      // 会话已被处理（例如另一个账号已批准）：绝不能改绑，
      // 也不能回"授权成功"让用户以为生效了。
      setResponseStatus(event, 409);
      return {
         error: 'invalid_state',
         error_description: '该验证码已被处理，不能重复授权',
      };
   }

   logger.info(
      { traceId, userId: user.userId, clientId: approved.session.clientId },
      '用户批准了设备授权',
   );

   return { status: 'approved' };
});
