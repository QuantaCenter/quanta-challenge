import { ApiError, isAbortError, NetworkError } from '../core/errors';
import type { Logger } from '../core/logger';
import { CLI_VERSION } from '../version';
import type { CookieJar } from './credentials';

export type FetchLike = (
   input: string,
   init?: RequestInit,
) => Promise<Response>;

export interface HttpClientOptions {
   baseUrl: string;
   fetch: FetchLike;
   cookies: CookieJar;
   logger: Pick<Logger, 'debug' | 'warn'>;
   timeoutMs?: number;
   signal?: AbortSignal;
   /** 令牌刷新后回写凭据文件 */
   onCookiesChanged?: (cookies: CookieJar) => void | Promise<void>;
}

export interface CallOptions {
   input?: unknown;
   method?: 'GET' | 'POST';
   signal?: AbortSignal;
}

/** tRPC 非批量（httpLink）的响应信封；仓库未启用 transformer，因此没有 json 包装层 */
interface TrpcSuccess {
   result: { data: unknown };
}
interface TrpcFailure {
   error: {
      json: {
         message?: string;
         code?: number;
         data?: {
            code?: string;
            httpStatus?: number;
            traceId?: string;
            zodError?: unknown;
         };
      };
   };
}

const COOKIE_NAMES = {
   access: 'quanta_access_token',
   refresh: 'quanta_refresh_token',
   csrf: 'quanta_csrf_token',
} as const;

export class HttpClient {
   readonly baseUrl: string;
   cookies: CookieJar;
   private readonly options: HttpClientOptions;
   private refreshing: Promise<boolean> | undefined;

   constructor(options: HttpClientOptions) {
      this.options = options;
      this.baseUrl = options.baseUrl.replace(/\/+$/, '');
      this.cookies = { ...options.cookies };
   }

   get hasSession(): boolean {
      return Boolean(this.cookies.access || this.cookies.refresh);
   }

   private url(path: string): string {
      if (/^https?:\/\//i.test(path)) return path;
      return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
   }

   private headers(extra: Record<string, string> = {}): Record<string, string> {
      const headers: Record<string, string> = {
         accept: 'application/json',
         'user-agent': `qpc/${CLI_VERSION} (quanta-problem-creator)`,
         ...extra,
      };

      const cookie = Object.entries(COOKIE_NAMES)
         .map(([key, name]) => {
            const value = this.cookies[key as keyof CookieJar];
            return value ? `${name}=${value}` : undefined;
         })
         .filter((entry): entry is string => Boolean(entry))
         .join('; ');
      if (cookie) headers.cookie = cookie;

      // 服务端的 CSRF 校验要求 cookie 与 x-csrf-token 一致（见 server/trpc/context.ts）。
      // 只拿到 access token（例如 CI 里注入 QUANTA_TOKEN）时没有 csrf 值，
      // 此时退回 `x-ssr: 1` —— 与仓库自带的 scripts/smoke-test.mjs 走的是同一条通道。
      if (this.cookies.csrf) {
         headers['x-csrf-token'] = this.cookies.csrf;
      } else {
         headers['x-ssr'] = '1';
      }

      return headers;
   }

   /** 解析 set-cookie 并并入 cookie jar，返回是否有变化 */
   private absorbCookies(response: Response): boolean {
      const raw = response.headers.getSetCookie?.() ?? [];
      if (raw.length === 0) return false;
      let changed = false;
      for (const entry of raw) {
         const [pair] = entry.split(';');
         if (!pair) continue;
         const index = pair.indexOf('=');
         if (index <= 0) continue;
         const name = pair.slice(0, index).trim();
         const value = pair.slice(index + 1).trim();
         for (const [key, cookieName] of Object.entries(COOKIE_NAMES)) {
            if (name !== cookieName) continue;
            const slot = key as keyof CookieJar;
            if (value === '') {
               delete this.cookies[slot];
            } else if (this.cookies[slot] !== value) {
               this.cookies[slot] = value;
            } else {
               continue;
            }
            changed = true;
         }
      }
      return changed;
   }

   private async persistCookies(): Promise<void> {
      await this.options.onCookiesChanged?.(this.cookies);
   }

   /** 低层请求：负责超时、错误分类与 cookie 吸收，不做 tRPC 解码 */
   async request(
      path: string,
      init: RequestInit & { timeoutMs?: number } = {},
   ): Promise<Response> {
      const url = this.url(path);
      const timeoutMs = init.timeoutMs ?? this.options.timeoutMs ?? 15_000;
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = init.signal
         ? AbortSignal.any([init.signal, timeoutSignal])
         : timeoutSignal;

      // 会话头**必须在这里统一注入**，而不是只给写请求加：
      // GET 查询同样需要 cookie 与 csrf。漏掉的表现是"查询接口全部 401、
      // 写接口却正常"，非常容易误判成服务端的权限问题。
      const headers: Record<string, string> = {
         ...this.headers(),
         ...((init.headers as Record<string, string> | undefined) ?? {}),
      };

      this.options.logger.debug(`${init.method ?? 'GET'} ${url}`);
      let response: Response;
      try {
         response = await this.options.fetch(url, { ...init, headers, signal });
      } catch (error) {
         if (isAbortError(error)) {
            throw new NetworkError(`请求超时或已取消：${url}`, {
               cause: error,
               details: { url, timeoutMs },
               hint: '确认服务已启动（docker compose up -d），或调大 QUANTA_HTTP_TIMEOUT。',
            });
         }
         throw new NetworkError(`无法连接 ${url}`, {
            cause: error,
            details: { url },
            hint: '确认 API 地址正确且服务已启动：qpc doctor',
         });
      }

      if (this.absorbCookies(response)) await this.persistCookies();
      return response;
   }

   /** 调用 tRPC procedure。path 形如 `admin.problem.upload` */
   async call<T>(path: string, options: CallOptions = {}): Promise<T> {
      const method = options.method ?? 'POST';
      const endpoint = `/api/trpc/${path}`;

      // 只刷新一次：服务端持续返回 401 时（例如账号被降权）不能无限循环刷新。
      const send = async (retried = false): Promise<T> => {
         const response =
            method === 'GET'
               ? await this.request(
                    `${endpoint}?input=${encodeURIComponent(JSON.stringify(options.input ?? null))}`,
                    { method: 'GET', signal: options.signal },
                 )
               : await this.request(endpoint, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(options.input ?? null),
                    signal: options.signal,
                 });

         const text = await response.text();
         const payload = parseJson(text);

         if (response.ok && isTrpcSuccess(payload))
            return payload.result.data as T;

         if (
            response.status === 401 &&
            !retried &&
            (await this.refreshSession())
         ) {
            return send(true);
         }

         throw this.toApiError(response, payload, endpoint);
      };

      return send();
   }

   /**
    * 用 refresh token 换新的 access token（GET /api/refresh）。
    * access token 只有 15 分钟，长时间轮询审计状态一定会过期，
    * 所以刷新是必需路径而不是兜底。
    */
   async refreshSession(): Promise<boolean> {
      if (this.refreshing) return this.refreshing;
      if (!this.cookies.refresh) return false;

      this.refreshing = (async () => {
         try {
            const response = await this.request('/api/refresh', {
               method: 'GET',
            });
            if (!response.ok) {
               this.options.logger.warn(
                  '刷新登录状态失败，请重新执行 `qpc login`',
               );
               return false;
            }
            await response.arrayBuffer();
            this.options.logger.debug('access token 已刷新');
            return Boolean(this.cookies.access);
         } catch {
            return false;
         } finally {
            this.refreshing = undefined;
         }
      })();

      return this.refreshing;
   }

   private toApiError(
      response: Response,
      payload: unknown,
      path: string,
   ): ApiError {
      const failure = payload as TrpcFailure | undefined;
      const json = failure?.error?.json;
      const message = json?.message ?? `HTTP ${response.status}`;
      const status = json?.data?.httpStatus ?? response.status;

      if (status === 401 || status === 403) {
         return new ApiError(message, {
            status,
            path,
            details: { code: json?.data?.code, traceId: json?.data?.traceId },
            hint:
               status === 401
                  ? '登录状态已失效：qpc login --force 重新登录。'
                  : '当前账号没有管理员权限（出题接口要求 role=ADMIN）。',
         });
      }

      return new ApiError(message, {
         status,
         path,
         details: {
            code: json?.data?.code,
            traceId: json?.data?.traceId,
            zodError: json?.data?.zodError,
         },
      });
   }
}

const parseJson = (text: string): unknown => {
   if (!text) return undefined;
   try {
      return JSON.parse(text);
   } catch {
      return undefined;
   }
};

const isTrpcSuccess = (payload: unknown): payload is TrpcSuccess =>
   typeof payload === 'object' &&
   payload !== null &&
   'result' in payload &&
   typeof (payload as TrpcSuccess).result?.data !== 'undefined';
