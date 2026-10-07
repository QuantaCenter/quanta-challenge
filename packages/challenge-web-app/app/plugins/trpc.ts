// plugins/trpc.client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../server/trpc/routes/index';
import useAuthStore from '~/stores/auth-store';
import { useMessageOutsideVue } from '~/components/st/Message/use-message';
import { TRPCError } from '@trpc/server';
import type { H3Event } from 'h3';
import { logger } from '~~/lib/logger';

// 常量定义
const TOKEN_KEYS = {
   ACCESS: 'quanta_access_token',
   REFRESH: 'quanta_refresh_token',
} as const;

/**
 * 将 cookies 对象转换为 cookie 字符串
 */
const serializeCookies = (cookies: Record<string, string>): string => {
   return Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
};

/**
 * 解析 cookie 字符串为对象
 */
const parseCookies = (cookieString: string): Record<string, string> => {
   const cookies: Record<string, string> = {};
   if (!cookieString) return cookies;

   cookieString.split(';').forEach((cookie) => {
      const [key, ...valueParts] = cookie.trim().split('=');
      if (key) {
         cookies[key] = valueParts.join('='); // 处理 value 中可能包含 = 的情况
      }
   });

   return cookies;
};

/**
 * 创建 Set-Cookie header 字符串
 */
const createSetCookieHeader = (
   name: string,
   value: string,
   isProduction: boolean,
): string => {
   const sameSite = isProduction ? 'lax' : 'strict';
   const secure = isProduction ? '; Secure' : '';
   return `${name}=${value}; HttpOnly; Path=/; SameSite=${sameSite}${secure}`;
};

/**
 * 在 SSR 环境下设置响应的 Set-Cookie headers
 */
const setSSRCookies = (
   event: H3Event,
   accessToken: string,
   refreshToken: string,
): void => {
   const isProduction = import.meta.env.NODE_ENV === 'production';
   const newCookies = [
      createSetCookieHeader(TOKEN_KEYS.ACCESS, accessToken, isProduction),
      createSetCookieHeader(TOKEN_KEYS.REFRESH, refreshToken, isProduction),
   ];

   const existing = event.node.res.getHeader('set-cookie');
   const existingArray = existing
      ? Array.isArray(existing)
         ? existing
         : [existing]
      : [];

   event.node.res.setHeader('set-cookie', [
      ...existingArray.map(String),
      ...newCookies,
   ]);
};

/**
 * 刷新 access token
 */
const refreshAccessToken = async (
   isServer: boolean,
   cookies: Record<string, string>,
   traceId: string,
): Promise<{ accessToken: string; refreshToken: string }> => {
   return await $fetch<{ accessToken: string; refreshToken: string }>(
      '/api/refresh',
      {
         credentials: 'include',
         headers: {
            ...(isServer ? { cookie: serializeCookies(cookies) } : {}),
            'x-ssr': isServer ? '1' : '0',
            'x-trace-id': traceId,
         } as HeadersInit,
      },
   );
};

/**
 * 更新 cookies 对象中的 token
 */
const updateTokensInCookies = (
   cookies: Record<string, string>,
   accessToken: string,
   refreshToken: string,
): void => {
   cookies[TOKEN_KEYS.ACCESS] = accessToken;
   cookies[TOKEN_KEYS.REFRESH] = refreshToken;
};

/**
 * 处理 token 刷新后的 SSR 逻辑
 */
const handleSSRTokenRefresh = (
   event: H3Event,
   cookies: Record<string, string>,
   accessToken: string,
   refreshToken: string,
   options: any,
): void => {
   // 设置 Set-Cookie headers 传递给客户端
   setSSRCookies(event, accessToken, refreshToken);

   // 更新 cookies 对象（cookies 和 ssrCookies 是同一个引用）
   updateTokensInCookies(cookies, accessToken, refreshToken);

   // 更新请求 headers
   options.headers.cookie = serializeCookies(cookies);
};

/**
 * 显示服务器错误提示
 */
const showServerError = (msg: string): void => {
   logger.error({ msg }, 'Internal server error happened');
   const message = useMessageOutsideVue();
   message.error('服务器错误，请稍后重试');
};

/**
 * 重定向到登录页
 */
const redirectToLogin = (
   isServer: boolean,
   event?: H3Event,
   currentPath?: string,
): void => {
   if (isServer && event) {
      event.node.res.writeHead(302, {
         Location:
            '/auth/login?redirect=' +
            encodeURIComponent(event.node.req.url || '/'),
      });
      event.node.res.end();
      return;
   }
   if (!isServer) {
      location.replace(
         '/auth/login?redirect=' + encodeURIComponent(currentPath || '/'),
      );
   }
};

/**
 * 处理未授权错误，尝试刷新 token 并重试请求
 */
const handleUnauthorized = async (
   url: RequestInfo | URL,
   options: any,
   isServer: boolean,
   cookies: Record<string, string>,
   event?: H3Event,
   currentPath?: string,
): Promise<Response> => {
   try {
      // 刷新 token
      const { accessToken, refreshToken } = await refreshAccessToken(
         isServer,
         cookies,
         options.headers['x-trace-id'] || 'unknown',
      );

      // SSR 环境需要手动更新 cookies 和 headers
      if (isServer && event) {
         handleSSRTokenRefresh(
            event,
            cookies,
            accessToken,
            refreshToken,
            options,
         );
      }
      // 客户端环境：cookie 已通过服务端 setCookie 自动设置到浏览器

      // 重新发起请求
      return await fetch(url, options);
   } catch (err) {
      // 重定向到登录页
      redirectToLogin(isServer, event, currentPath);
      throw err;
   }
};

const genUUID = (): string => {
   return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
   });
};

export default defineNuxtPlugin(() => {
   const authStore = useAuthStore();

   // 在插件顶层获取 Nuxt composables
   const event = import.meta.server ? useRequestEvent() : undefined;
   const route = import.meta.client ? useRoute() : undefined;

   // SSR 阶段提前读取 Cookie 并解析
   let ssrCookies: Record<string, string> = {};
   if (import.meta.server) {
      const headers = useRequestHeaders(['cookie']);
      const cookieString = headers.cookie || '';
      ssrCookies = parseCookies(cookieString);
   }

   const baseUrl = import.meta.server
      ? useRuntimeConfig().public.appBaseUrl
      : '';
   const isServer = import.meta.server;

   const trpc = createTRPCClient<AppRouter>({
      links: [
         httpBatchLink({
            url: baseUrl + '/api/trpc',
            headers() {
               const csrfToken = authStore.csrfToken;
               return {
                  ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
                  'x-ssr': isServer ? '1' : '0',
                  'x-trace-id': genUUID(),
               };
            },
            async fetch(url, options: any) {
               // SSR 环境使用解析后的 cookies，客户端使用空对象
               const cookies = isServer ? ssrCookies : {};

               // 构建请求 headers
               const headers: Record<string, string> = {
                  ...options?.headers,
                  'x-ssr': isServer ? '1' : '0',
               };

               // SSR 环境添加 Cookie header
               if (isServer && Object.keys(cookies).length > 0) {
                  headers.cookie = serializeCookies(cookies);
               }

               // 发起初始请求
               let res = await fetch(url, {
                  ...options,
                  headers,
               }).catch((err) => {
                  // 将 TRPC UNAUTHORIZED 错误转换为 401 响应
                  if (err instanceof TRPCError && err.code === 'UNAUTHORIZED') {
                     return { status: 401 } as Response;
                  }
                  logger.error({ url, err, headers }, 'Fetch error');
                  throw err;
               });

               // 处理 401 未授权错误 - 尝试刷新 token
               if (res.status === 401 || res.status === 207) {
                  res = await handleUnauthorized(
                     url as RequestInfo,
                     options,
                     isServer,
                     cookies,
                     event,
                     route?.fullPath,
                  );
               }

               // 客户端显示 5xx 服务器错误提示
               // 必须读**克隆体**：直接 await res.text() 会把响应体消费掉，
               // tRPC 之后再去 res.json() 只会抛
               // "Failed to execute 'json' on 'Response': body stream already read"，
               // 把服务端真正的错误信息整个吞掉（排查时极具误导性）。
               if (res.status >= 500 && !isServer) {
                  showServerError(await res.clone().text());
               }

               return res;
            },
         }),
      ],
   });

   return {
      provide: {
         trpc,
      },
   };
});
