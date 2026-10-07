import { describe, expect, it } from 'vitest';

import { ApiError, NetworkError } from '../../src/core/errors';
import { createLogger } from '../../src/core/logger';
import { HttpClient } from '../../src/services/http';
import { createFakeApi, trpcError, trpcOk } from '../helpers/fake-api';

const silentLogger = createLogger({
   level: 'silent',
   json: false,
   color: false,
});

const createClient = (
   api: ReturnType<typeof createFakeApi>,
   cookies = {},
   onCookiesChanged?: (cookies: Record<string, string | undefined>) => void,
) =>
   new HttpClient({
      baseUrl: 'http://localhost:3000/',
      fetch: api.fetch,
      cookies,
      logger: silentLogger,
      onCookiesChanged: onCookiesChanged as never,
   });

describe('HttpClient', () => {
   it('按仓库约定解码 tRPC 响应：body 是裸 input，响应在 result.data', async () => {
      const api = createFakeApi({
         'POST /api/trpc/admin.problem.upload': (request) =>
            trpcOk({ problemId: 42, echo: request.body }),
      });
      const client = createClient(api);

      const result = await client.call<{ problemId: number; echo: unknown }>(
         'admin.problem.upload',
         { input: { title: 'x' } },
      );

      expect(result.problemId).toBe(42);
      expect(result.echo).toEqual({ title: 'x' });
      expect(api.requests[0]?.headers['content-type']).toBe('application/json');
   });

   it('query 走 GET 且把 input 放进 ?input=', async () => {
      const api = createFakeApi({
         'GET /api/trpc/admin.problem.getAuditDetail': (request) =>
            trpcOk({ pid: (request.input as { problemId: number }).problemId }),
      });
      const client = createClient(api);

      const detail = await client.call<{ pid: number }>(
         'admin.problem.getAuditDetail',
         { input: { problemId: 7 }, method: 'GET' },
      );

      expect(detail.pid).toBe(7);
      expect(api.requests[0]?.url.searchParams.get('input')).toBe(
         '{"problemId":7}',
      );
   });

   it('有 csrf token 时发 x-csrf-token，否则退回 x-ssr 通道', async () => {
      const api = createFakeApi({
         'GET /api/trpc/auth.login.getUser': () => trpcOk({}),
      });

      const withCsrf = createClient(api, { access: 'a', csrf: 'c' });
      await withCsrf.call('auth.login.getUser', { method: 'GET' });
      expect(api.requests[0]?.headers['x-csrf-token']).toBe('c');
      expect(api.requests[0]?.headers.cookie).toContain('quanta_csrf_token=c');

      const tokenOnly = createClient(api, { access: 'a' });
      await tokenOnly.call('auth.login.getUser', { method: 'GET' });
      expect(api.requests[1]?.headers['x-csrf-token']).toBeUndefined();
      expect(api.requests[1]?.headers['x-ssr']).toBe('1');
   });

   it('吸收 set-cookie 并回写（登录后不需要再手工存令牌）', async () => {
      const api = createFakeApi({
         'POST /api/trpc/auth.login.email': () => ({
            ...trpcOk({ csrfToken: 'csrf-from-body' }),
            setCookies: [
               'quanta_access_token=access-1; Path=/; HttpOnly',
               'quanta_refresh_token=refresh-1; Path=/; HttpOnly',
               'quanta_csrf_token=csrf-1; Path=/',
            ],
         }),
      });
      const saved: Array<Record<string, string | undefined>> = [];
      const client = createClient(
         api,
         {},
         (cookies) => void saved.push(cookies),
      );

      await client.call('auth.login.email', {
         input: { email: 'a@b.c', password: 'x' },
      });

      expect(client.cookies).toEqual({
         access: 'access-1',
         refresh: 'refresh-1',
         csrf: 'csrf-1',
      });
      expect(saved).toHaveLength(1);
   });

   it('401 时用 refresh token 刷新并只重试一次', async () => {
      let attempts = 0;
      const api = createFakeApi({
         'GET /api/trpc/admin.problem.list': () => {
            attempts += 1;
            return attempts === 1
               ? trpcError('Required authentication', {
                    status: 401,
                    code: 'UNAUTHORIZED',
                 })
               : trpcOk([{ pid: 1, title: 't' }]);
         },
         'GET /api/refresh': () => ({
            body: { accessToken: 'new' },
            setCookies: ['quanta_access_token=access-2; Path=/; HttpOnly'],
         }),
      });
      const client = createClient(api, {
         access: 'expired',
         refresh: 'refresh-1',
      });

      const problems = await client.call<Array<{ pid: number }>>(
         'admin.problem.list',
         {
            input: { tids: [] },
            method: 'GET',
         },
      );

      expect(problems).toHaveLength(1);
      expect(api.count('GET', '/api/refresh')).toBe(1);
      expect(api.count('GET', '/api/trpc/admin.problem.list')).toBe(2);
      // 请求顺序：原请求（401）→ refresh → 重试；重试必须带上新令牌
      expect(api.requests[1]?.path).toBe('/api/refresh');
      expect(api.requests[2]?.headers.cookie).toContain(
         'quanta_access_token=access-2',
      );
      expect(api.requests[2]?.headers.cookie).not.toContain('expired');
   });

   it('刷新失败后仍然 401 → AuthError 且提示重新登录', async () => {
      const api = createFakeApi({
         'GET /api/trpc/admin.problem.list': () =>
            trpcError('Required authentication', {
               status: 401,
               code: 'UNAUTHORIZED',
            }),
         'GET /api/refresh': () => ({
            status: 401,
            body: { error: 'Unauthorized' },
         }),
      });
      const client = createClient(api, { access: 'expired', refresh: 'bad' });

      const error = await client
         .call('admin.problem.list', { input: { tids: [] }, method: 'GET' })
         .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).exitCode).toBe(5);
      expect((error as ApiError).hint).toContain('qpc login');
   });

   it('5xx 之外的服务端错误保留字段级信息（zodError / traceId）', async () => {
      const api = createFakeApi({
         'POST /api/trpc/admin.problem.upload': () => ({
            status: 400,
            body: {
               error: {
                  json: {
                     message: 'Title is required',
                     data: {
                        httpStatus: 400,
                        traceId: 'trace-1',
                        zodError: {
                           fieldErrors: { title: ['Title is required'] },
                        },
                     },
                  },
               },
            },
         }),
      });
      const client = createClient(api, { access: 'a' });

      const error = (await client
         .call('admin.problem.upload', { input: {} })
         .catch((e: unknown) => e)) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(400);
      expect(error.details?.traceId).toBe('trace-1');
   });

   it('网络不可达时抛 NetworkError 且给出启动建议', async () => {
      const client = new HttpClient({
         baseUrl: 'http://localhost:3000',
         fetch: () => Promise.reject(new Error('ECONNREFUSED')),
         cookies: {},
         logger: silentLogger,
      });

      const error = (await client
         .call('auth.login.getUser', { method: 'GET' })
         .catch((e: unknown) => e)) as NetworkError;

      expect(error).toBeInstanceOf(NetworkError);
      expect(error.hint).toContain('qpc doctor');
   });
});
