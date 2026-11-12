import { createError, getCookie, getHeader, type H3Event } from 'h3';
import { TRPCError } from '@trpc/server';
import { verifyToken, type ITokenPayload } from './jwt';

/** 非 tRPC 路由的登录校验（规则同 trpc/context.ts）；写操作需同时校验 CSRF 双提交令牌 */
export const requireEventUser = (
   event: H3Event,
   options: { csrf: boolean },
): ITokenPayload => {
   const token = getCookie(event, 'quanta_access_token');
   if (!token) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
   }
   if (options.csrf) {
      const csrfToken = getCookie(event, 'quanta_csrf_token');
      const xCsrfToken = getHeader(event, 'x-csrf-token');
      if (!csrfToken || !xCsrfToken || csrfToken !== xCsrfToken) {
         throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
      }
   }
   try {
      return verifyToken(token);
   } catch {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
   }
};

const TRPC_TO_HTTP: Partial<Record<TRPCError['code'], number>> = {
   BAD_REQUEST: 400,
   UNAUTHORIZED: 401,
   FORBIDDEN: 403,
   NOT_FOUND: 404,
   CONFLICT: 409,
   PAYLOAD_TOO_LARGE: 413,
};

/** 把服务层抛出的 TRPCError 转成 h3 错误，保留中文提示（statusMessage 只允许 ASCII，提示放在 data.message） */
export const toHttpError = (error: unknown) => {
   if (error instanceof TRPCError) {
      return createError({
         statusCode: TRPC_TO_HTTP[error.code] ?? 500,
         statusMessage: error.code,
         data: { message: error.message },
      });
   }
   return error;
};
