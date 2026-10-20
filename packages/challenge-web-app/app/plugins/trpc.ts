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
 * 解码 JWT payload 的 exp（毫秒时间戳）。仅用于客户端调度主动续签，
 * 签名校验始终由服务端完成。
 */
const decodeJwtExpMs = (token: string): number | null => {
   try {
      const base64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
      if (!base64) return null;
      const payload = JSON.parse(atob(base64)) as { exp?: unknown };
      return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
   } catch {
      return null;
   }
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
 * 显示服务器错误提示
 */
const showServerError = (msg: string): void => {
   logger.error({ msg }, 'Internal server error happened');
   const message = useMessageOutsideVue();
   message.error('服务器错误，请稍后重试');
};

/**
 * SSR 下重定向到登录页（客户端的 SPA 跳转见插件内的 redirectToLoginClient）
 */
const redirectToLoginSSR = (event: H3Event): void => {
   const target = event.node.req.url || '/';
   // 已经在登录流程页时不再重定向：登录接口本身返回 401（密码错误）、 或登录页上的其他请求 401 时，若也走重定向，会把 /auth/login 塞进 redirect 参数，登录成功后又被弹回登录页，URL 自我嵌套无限循环。 此时直接抛错即可，登录页会展示「登录失败」提示。
   // OAuth has its own safe restart UI; do not replace it with an email-login redirect.
   if (target.startsWith('/auth/login') || isQuantaLoginPath(target)) {
      return;
   }
   event.node.res.writeHead(302, {
      Location: '/auth/login?redirect=' + encodeURIComponent(target),
   });
   event.node.res.end();
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
   // 实时读取当前路由（插件初始化时捕获的 route 会在 SPA 导航后过期，redirect 参数会带上旧路径）
   const router = import.meta.client ? useRouter() : undefined;

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

   // single-flight 刷新：切换页面时中间件的 getUser 与新页面数据请求会同时收到 401，
   // 必须共享同一次 /api/refresh，否则 N+1 并发刷新互相竞态。
   // SSR 插件随每个请求重新执行（作用域天然按请求隔离），客户端插件只执行一次（应用级单例）。
   let refreshInFlight: Promise<void> | null = null;

   // 主动滑动续签：业务请求一旦带着过期 token 发出，浏览器控制台必然出现 401 网络报错（JS 无法抑制）。
   // 因此在过期前提前静默刷新，让业务请求拿到的一直是有效 token；续签真正失败时，/api/refresh
   // 的 401 才会出现在控制台。
   const PROACTIVE_MARGIN_MS = 30_000;
   let tokenExpMs: number | null = null;
   let proactiveTimer: ReturnType<typeof setTimeout> | null = null;

   const refreshOnce = (): Promise<void> => {
      refreshInFlight ??= (async () => {
         const { accessToken, refreshToken } = await refreshAccessToken(
            isServer,
            ssrCookies,
            genTraceId(),
         );
         if (isServer && event) {
            setSSRCookies(event, accessToken, refreshToken);
            updateTokensInCookies(ssrCookies, accessToken, refreshToken);
         } else {
            // 客户端：cookie 已通过服务端 setCookie 自动写入浏览器；
            // 记录新 access token 的过期时间并调度下一次主动续签
            tokenExpMs = decodeJwtExpMs(accessToken);
            if (proactiveTimer) clearTimeout(proactiveTimer);
            if (tokenExpMs) {
               const delay = Math.max(
                  tokenExpMs - PROACTIVE_MARGIN_MS - Date.now(),
                  1000,
               );
               proactiveTimer = setTimeout(() => {
                  void ensureFreshToken();
               }, delay);
            }
         }
      })().finally(() => {
         refreshInFlight = null;
      });
      return refreshInFlight;
   };

   // 主动续签入口：token 仍远离过期时零开销直接返回；只用于「提前」续签，
   // 失败时静默吞掉（不跳转），真实请求 401 时由 handleUnauthorized 兜底处理
   const ensureFreshToken = async (): Promise<void> => {
      if (isServer) return;
      if (tokenExpMs !== null && Date.now() < tokenExpMs - PROACTIVE_MARGIN_MS) {
         return;
      }
      try {
         await refreshOnce();
      } catch {
         // 滑动续签失败：/api/refresh 的 401 已出现在控制台，此处不额外处理
      }
   };

   // 客户端 401 统一走一次幂等的 SPA 跳转。此前每个失败请求各自 location.replace（文档级卸载）
   // 并 throw，与中间件的 SPA navigateTo 及 out-in 页面过渡竞速，会把过渡打断在「旧页已卸载、
   // 新页未挂载」的状态，表现为侧边栏/顶栏保留、内容区永久空白。
   let clientRedirecting = false;

   const redirectToLoginClient = (): void => {
      if (clientRedirecting) return;
      const target = router?.currentRoute.value.fullPath || '/';
      // 登录流程页内不再跳转（避免 redirect 自我嵌套），OAuth 有自己的重启 UI
      if (target.startsWith('/auth/login') || isQuantaLoginPath(target)) {
         return;
      }
      clientRedirecting = true;
      // navigateTo 在中间件处理中会返回待处理的路由对象而非 Promise，交给 auth-guard 执行；
      // 这里用 Promise.resolve 统一包装，仅在返回 Promise 且被拒时退回整页跳转兜底
      void Promise.resolve(
         navigateTo('/auth/login?redirect=' + encodeURIComponent(target)),
      ).catch(() => {
         location.replace(
            '/auth/login?redirect=' + encodeURIComponent(target),
         );
      });
   };

   /**
    * 处理未授权错误：共享一次 token 刷新后重试请求
    */
   const handleUnauthorized = async (
      url: RequestInfo | URL,
      options: RequestOptions,
   ): Promise<Response> => {
      try {
         await refreshOnce();
         // SSR：刷新结果已写回共享 ssrCookies，逐请求同步到自己的请求头
         if (isServer && event) {
            options.headers.cookie = serializeCookies(ssrCookies);
         }
         // 重新发起请求
         return await fetch(url, options);
      } catch (err) {
         if (isServer && event) {
            redirectToLoginSSR(event);
         } else {
            redirectToLoginClient();
         }
         throw err;
      }
   };

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
            res = await handleUnauthorized(url as RequestInfo, requestOptions);
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
         // 供 auth-guard 等在发请求前确保 token 未临近过期（临近才真正发起 /api/refresh）
         ensureFreshToken,
      },
   };
});
