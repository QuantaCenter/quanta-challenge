import type { FetchLike } from '../../src/services/http';

export interface FakeRequest {
   method: string;
   url: URL;
   path: string;
   /** 解析后的 JSON body（非 JSON 时为 undefined） */
   body: unknown;
   /** tRPC query 的 input 参数（已解析） */
   input: unknown;
   headers: Record<string, string>;
}

export interface FakeResult {
   status?: number;
   body?: unknown;
   headers?: Record<string, string>;
   setCookies?: string[];
}

export type FakeHandler = (request: FakeRequest) => FakeResult;

export interface FakeApi {
   fetch: FetchLike;
   requests: FakeRequest[];
   /** 某个路由被调用的次数 */
   count(method: string, path: string): number;
}

/**
 * 极小的假服务端。
 *
 * 路由键是 `METHOD /path`，例如 `POST /api/trpc/admin.problem.upload`。
 * 刻意不用 mock 库：CLI 与 tRPC 的契约（body 是裸 input、响应是
 * `{result:{data}}`、错误是 `{error:{json}}`）正是需要被测试固化的部分，
 * 用 mock 库替掉这些细节就失去了意义。
 */
export const createFakeApi = (routes: Record<string, FakeHandler>): FakeApi => {
   const requests: FakeRequest[] = [];

   const fetch: FetchLike = async (input, init) => {
      const url = new URL(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(
         (init?.headers ?? {}) as Record<string, string>,
      )) {
         headers[key.toLowerCase()] = value;
      }

      let body: unknown;
      if (typeof init?.body === 'string') {
         try {
            body = JSON.parse(init.body);
         } catch {
            body = init.body;
         }
      }

      let queryInput: unknown;
      const rawInput = url.searchParams.get('input');
      if (rawInput) {
         try {
            queryInput = JSON.parse(rawInput);
         } catch {
            queryInput = rawInput;
         }
      }

      const request: FakeRequest = {
         method,
         url,
         path: url.pathname,
         body,
         input: queryInput ?? body,
         headers,
      };
      requests.push(request);

      const handler = routes[`${method} ${url.pathname}`];
      if (!handler) {
         return jsonResponse(
            {
               error: {
                  json: {
                     message: `没有为 ${method} ${url.pathname} 定义假路由`,
                     data: { httpStatus: 404 },
                  },
               },
            },
            404,
         );
      }

      const result = handler(request);
      const response = jsonResponse(
         result.body ?? null,
         result.status ?? 200,
         result.headers,
      );
      for (const cookie of result.setCookies ?? []) {
         response.headers.append('set-cookie', cookie);
      }
      return response;
   };

   return {
      fetch,
      requests,
      count: (method, path) =>
         requests.filter(
            (entry) => entry.method === method && entry.path === path,
         ).length,
   };
};

const jsonResponse = (
   body: unknown,
   status: number,
   headers: Record<string, string> = {},
): Response =>
   new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
   });

/** tRPC 成功响应 */
export const trpcOk = (data: unknown): FakeResult => ({
   body: { result: { data } },
});

/** tRPC 错误响应（形状与 trpc.ts 的 errorFormatter 一致） */
export const trpcError = (
   message: string,
   options: { status?: number; code?: string } = {},
): FakeResult => ({
   status: options.status ?? 400,
   body: {
      error: {
         json: {
            message,
            code: -32600,
            data: {
               code: options.code ?? 'BAD_REQUEST',
               httpStatus: options.status ?? 400,
            },
         },
      },
   },
});
