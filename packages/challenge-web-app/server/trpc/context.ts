import type { H3Event } from 'h3';
import type { ITokenPayload } from '../utils/jwt';
import { verifyToken } from '../utils/jwt';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getRequestContext } from '@challenge/shared/trace';

export const createContext = async (event: H3Event) => {
   const token = getCookie(event, 'quanta_access_token');
   const csrfToken = getCookie(event, 'quanta_csrf_token');
   const xCsrfToken = getHeader(event, 'x-csrf-token');
   const isServer = getHeader(event, 'x-ssr') === '1';

   // trace 由 plugins/trace-context.ts 的 ALS 全局注入（含 CSRF 失败的请求），这里只读取。
   const traceId = getRequestContext()?.traceId;

   if (!isServer) {
      if (!csrfToken || !xCsrfToken || csrfToken !== xCsrfToken) {
         return { event, traceId };
      }
   }

   if (!token) {
      return { event, traceId };
   }

   let user: ITokenPayload | null;
   try {
      user = verifyToken(token);
   } catch (error) {
      user = null;
   }

   // 认证完成后补写用户身份进请求上下文，日志经 mixin 自动携带 quanta.user.*（方案 §2.4）。
   if (user) {
      const store = getRequestContext();
      if (store) {
         store.userId = user.userId;
         store.role = user.role;
      }
   }

   return { event, user, traceId };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

export interface IRequestContextPayload {
   userId: string;
}

export const requestContext = new AsyncLocalStorage<IRequestContextPayload>();
