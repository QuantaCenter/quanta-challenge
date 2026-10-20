// plugins/trpc.client.ts
import {
   createTRPCClient,
   httpBatchLink,
   httpLink,
   splitLink,
} from '@trpc/client';
import { TRPCError } from '@trpc/server';
import type { H3Event } from 'h3';
import { useMessageOutsideVue } from '~/components/st/Message/use-message';
import useAuthStore from '~/stores/auth-store';
import {
   isQuantaLoginPath,
   isQuantaProcedure,
   isQuantaRpcRequest,
} from '~/utils/quanta-login';
import { logger } from '~~/lib/logger';
import type { AppRouter } from '../../server/trpc/routes/index';

// 常量定义
const TOKEN_KEYS = {
   ACCESS: 'quanta_access_token',
   REFRESH: 'quanta_refresh_token',
} as const;

type RequestOptions = RequestInit & { headers: Record<string, string> };

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
   secure: boolean,
): string => {
   return `${name}=${value}; HttpOnly; Path=/; SameSite=lax${secure ? '; Secure' : ''}`;
};

/**
 * 在 SSR 环境下设置响应的 Set-Cookie headers
 */
const setSSRCookies = (
   event: H3Event,
   accessToken: string,
   refreshToken: string,
): void => {
   const isProduction = process.env.NODE_ENV === 'production';
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
   options: RequestOptions,
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
   const target = (isServer ? event?.node.req.url : currentPath) || '/';
   // 已经在登录流程页时不再重定向：登录接口本身返回 401（密码错误）、 或登录页上的其他请求 401 时，若也走重定向，会把 /auth/login 塞进 redirect 参数，登录成功后又被弹回登录页，URL 自我嵌套无限循环。 此时直接抛错即可，登录页会展示「登录失败」提示。
   // OAuth has its own safe restart UI; do not replace it with an email-login redirect.
   if (target.startsWith('/auth/login') || isQuantaLoginPath(target)) {
      return;
   }
   if (isServer && event) {
      event.node.res.writeHead(302, {
         Location: '/auth/login?redirect=' + encodeURIComponent(target),
      });
      event.node.res.end();
      return;
   }
   if (!isServer) {
      location.replace('/auth/login?redirect=' + encodeURIComponent(target));
   }
};

/**
 * 处理未授权错误，尝试刷新 token 并重试请求
 */
const handleUnauthorized = async (
   url: RequestInfo | URL,
   options: RequestOptions,
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

const genTraceId = (): string => {
   if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID().replaceAll('-', '');
   }
   let out = '';
   while (out.length < 32) out += Math.floor(Math.random() * 16).toString(16);
   return out;
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

   const linkOptions = {
      url: baseUrl + '/api/trpc',
      headers() {
         const csrfToken = authStore.csrfToken;
         return {
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
            'x-ssr': isServer ? '1' : '0',
            'x-trace-id': genTraceId(),
         };
      },
      async fetch(url: RequestInfo | URL, options: RequestInit | undefined) {
         const oauthRequest = isQuantaRpcRequest(url);
         // SSR 环境使用解析后的 cookies，客户端使用空对象
         const cookies = isServer ? ssrCookies : {};

         // 构建请求 headers
         const headers: Record<string, string> = {
            ...Object.fromEntries(new Headers(options?.headers)),
            'x-ssr': isServer ? '1' : '0',
         };

         // SSR 环境添加 Cookie header
         if (isServer && Object.keys(cookies).length > 0) {
            headers.cookie = serializeCookies(cookies);
         }

         // 发起初始请求
         const requestOptions: RequestOptions = { ...options, headers };
         let res = await fetch(url, requestOptions).catch((err) => {
            // 将 TRPC UNAUTHORIZED 错误转换为 401 响应
            if (err instanceof TRPCError && err.code === 'UNAUTHORIZED') {
               return { status: 401 } as Response;
            }
            if (oauthRequest) {
               logger.error(
                  { operation: 'auth.quanta' },
                  'OAuth transport failed',
               );
            } else {
               logger.error({ url, err, headers }, 'Fetch error');
            }
            throw err;
         });

         // 处理 401 未授权错误 - 尝试刷新 token
         if (!oauthRequest && (res.status === 401 || res.status === 207)) {
            res = await handleUnauthorized(
               url as RequestInfo,
               requestOptions,
               isServer,
               cookies,
               event,
               route?.fullPath,
            );
         }

         // 客户端显示 5xx 服务器错误提示 必须读**克隆体**：直接 await res.text() 会把响应体消费掉， tRPC 之后再去 res.json() 只会抛 "Failed to execute 'json' on 'Response': body stream already read"， 把服务端真正的错误信息整个吞掉（排查时极具误导性）。
         if (res.status >= 500 && !isServer && !oauthRequest) {
            showServerError(await res.clone().text());
         }

         return res;
      },
   };

   const trpc = createTRPCClient<AppRouter>({
      links: [
         splitLink({
            condition: (operation) => isQuantaProcedure(operation.path),
            // Cookie-changing and one-time OAuth actions must not share batches
            // or be replayed by the regular authentication refresh transport.
            true: httpLink(linkOptions),
            false: httpBatchLink(linkOptions),
         }),
      ],
   });

   return {
      provide: {
         trpc,
      },
   };
});
