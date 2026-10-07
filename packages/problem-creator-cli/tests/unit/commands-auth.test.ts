import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runDoctor } from '../../src/commands/doctor';
import { runLogin } from '../../src/commands/login';
import { CliError } from '../../src/core/errors';
import {
   credentialsPath,
   readCredentials,
} from '../../src/services/credentials';
import {
   createFakeApi,
   type FakeResult,
   trpcError,
   trpcOk,
} from '../helpers/fake-api';
import { createTestContext, exampleDir } from '../helpers/harness';

const CONFIG_DIR = join(tmpdir(), 'qpc-test-auth');

afterEach(async () => {
   await rm(CONFIG_DIR, { recursive: true, force: true });
});

const loginRoutes = () => ({
   'POST /api/trpc/auth.login.email': () => ({
      ...trpcOk({
         user: {
            id: 'u1',
            nickname: 'admin',
            email: 'admin@example.com',
            role: 'ADMIN',
         },
         csrfToken: 'csrf-1',
      }),
      setCookies: [
         'quanta_access_token=access-1; Path=/; HttpOnly',
         'quanta_refresh_token=refresh-1; Path=/; HttpOnly',
         'quanta_csrf_token=csrf-1; Path=/',
      ],
   }),
});

describe('qpc login', () => {
   it('登录成功后把 cookie 与会话写入凭据文件（权限 0600）', async () => {
      const api = createFakeApi(loginRoutes());
      const { ctx, harness } = await createTestContext({
         cwd: exampleDir(),
         env: { QUANTA_CONFIG_DIR: CONFIG_DIR, QUANTA_PASSWORD: 'secret' },
         fetch: api.fetch,
      });

      await runLogin(ctx, { email: 'admin@example.com' });

      const stored = await readCredentials(credentialsPath(CONFIG_DIR));
      expect(stored.cookies.access).toBe('access-1');
      expect(stored.cookies.refresh).toBe('refresh-1');
      expect(stored.user?.role).toBe('ADMIN');
      expect(harness.out()).toContain('已登录');
      expect(api.requests[0]?.body).toEqual({
         email: 'admin@example.com',
         password: 'secret',
      });
      // 密码绝不能出现在日志里
      expect(harness.out() + harness.err()).not.toContain('secret');
   });

   it('--password-stdin 不可用时（非 TTY 且无环境变量）给出用法提示', async () => {
      const api = createFakeApi(loginRoutes());
      const { ctx } = await createTestContext({
         cwd: exampleDir(),
         env: { QUANTA_CONFIG_DIR: CONFIG_DIR },
         fetch: api.fetch,
      });
      await expect(runLogin(ctx, { email: 'a@b.c' })).rejects.toThrow(
         /非交互环境/,
      );
   });

   it('登录失败时把服务端消息原样抛出', async () => {
      const api = createFakeApi({
         'POST /api/trpc/auth.login.email': () =>
            trpcError('Invalid email or password', {
               status: 401,
               code: 'UNAUTHORIZED',
            }),
      });
      const { ctx } = await createTestContext({
         cwd: exampleDir(),
         env: { QUANTA_CONFIG_DIR: CONFIG_DIR, QUANTA_PASSWORD: 'bad' },
         fetch: api.fetch,
      });

      await expect(runLogin(ctx, { email: 'a@b.c' })).rejects.toThrow(
         /Invalid email or password/,
      );
   });

   it('--logout 删除凭据，--show 在未登录时不报错', async () => {
      const api = createFakeApi(loginRoutes());
      const { ctx, harness } = await createTestContext({
         cwd: exampleDir(),
         env: { QUANTA_CONFIG_DIR: CONFIG_DIR, QUANTA_PASSWORD: 'secret' },
         fetch: api.fetch,
      });

      await expect(runLogin(ctx, { show: true })).resolves.toBeUndefined();
      expect(harness.out() + harness.err()).toContain('未登录');

      await runLogin(ctx, { email: 'a@b.c' });
      await runLogin(ctx, { logout: true });
      const stored = await readCredentials(credentialsPath(CONFIG_DIR));
      expect(stored.cookies).toEqual({});
   });
});

describe('qpc login --device（设备码流程）', () => {
   const deviceRoutes = (tokenStatus: () => FakeResult) => ({
      'POST /api/oauth/device/authorize': () => ({
         body: {
            device_code: 'device-abc',
            user_code: 'WDJB-MJHT',
            verification_uri: 'http://localhost:3000/auth/device',
            verification_uri_complete:
               'http://localhost:3000/auth/device?user_code=WDJB-MJHT',
            expires_in: 600,
            interval: 5,
         },
      }),
      'POST /api/oauth/device/token': () => tokenStatus(),
      'GET /api/trpc/auth.login.getUser': () =>
         trpcOk({
            user: {
               id: 'u1',
               nickname: 'admin',
               email: 'admin@example.com',
               role: 'ADMIN',
            },
         }),
   });

   it('展示验证地址与验证码，成功后写入凭据', async () => {
      const api = createFakeApi(
         deviceRoutes(() => ({
            body: {
               access_token: 'access-from-device',
               refresh_token: 'refresh-from-device',
               token_type: 'Bearer',
               expires_in: 900,
               scope: 'problem:write',
            },
         })),
      );
      const { ctx, harness } = await createTestContext({
         cwd: exampleDir(),
         env: { QUANTA_CONFIG_DIR: CONFIG_DIR },
         fetch: api.fetch,
      });

      await runLogin(ctx, { device: true, noBrowser: true });

      // RFC 8628 §3.3：地址与验证码都必须展示（--no-browser 时尤其重要）
      const output = harness.out();
      expect(output).toContain('http://localhost:3000/auth/device');
      expect(output).toContain('WDJB-MJHT');
      expect(output).toContain('已登录');

      const stored = await readCredentials(credentialsPath(CONFIG_DIR));
      expect(stored.cookies.access).toBe('access-from-device');
      expect(stored.cookies.refresh).toBe('refresh-from-device');
   });

   it('用户拒绝时立即失败，不再轮询', async () => {
      const api = createFakeApi(
         deviceRoutes(() => ({
            status: 400,
            body: { error: 'access_denied' },
         })),
      );
      const { ctx } = await createTestContext({
         cwd: exampleDir(),
         env: { QUANTA_CONFIG_DIR: CONFIG_DIR },
         fetch: api.fetch,
      });

      await expect(
         runLogin(ctx, { device: true, noBrowser: true }),
      ).rejects.toThrow(/拒绝/);
      // 只请求一次 token：不能对着已拒绝的授权反复轮询
      expect(api.count('POST', '/api/oauth/device/token')).toBe(1);
      // 不应写入任何凭据
      const stored = await readCredentials(credentialsPath(CONFIG_DIR));
      expect(stored.cookies.access).toBeUndefined();
   });

   it('--json 输出包含 loginMethod=device_code', async () => {
      const api = createFakeApi(
         deviceRoutes(() => ({
            body: {
               access_token: 'at',
               refresh_token: 'rt',
               token_type: 'Bearer',
               expires_in: 900,
               scope: 'problem:write',
            },
         })),
      );
      const { ctx, harness } = await createTestContext({
         cwd: exampleDir(),
         env: { QUANTA_CONFIG_DIR: CONFIG_DIR },
         fetch: api.fetch,
         globals: { json: true },
      });

      await runLogin(ctx, { device: true, noBrowser: true });

      const lines = harness.out().trim().split('\n');
      const payload = JSON.parse(lines[lines.length - 1]!);
      expect(payload.loginMethod).toBe('device_code');
   });
});

describe('qpc doctor', () => {
   it('全部健康时通过', async () => {
      const api = createFakeApi({
         ...loginRoutes(),
         'GET /api/trpc/auth.login.getUser': () =>
            trpcOk({
               user: {
                  id: 'u1',
                  nickname: 'admin',
                  email: 'admin@example.com',
                  role: 'ADMIN',
               },
            }),
      });
      const { ctx, harness } = await createTestContext({
         cwd: exampleDir(),
         env: { QUANTA_CONFIG_DIR: CONFIG_DIR, QUANTA_PASSWORD: 'secret' },
         fetch: api.fetch,
      });
      await runLogin(ctx, { email: 'admin@example.com' });

      await runDoctor(ctx);

      expect(harness.out()).toContain('全部检查通过');
   });

   it('API 不可达时失败并给出启动建议', async () => {
      const { ctx } = await createTestContext({
         cwd: exampleDir(),
         env: { QUANTA_CONFIG_DIR: CONFIG_DIR },
         fetch: () => Promise.reject(new Error('ECONNREFUSED')),
      });

      const error = (await runDoctor(ctx).catch((e: unknown) => e)) as CliError;
      expect(error).toBeInstanceOf(CliError);
      expect(error.exitCode).toBe(1);
      expect(error.hint).toContain('修复');
   });

   it('未登录时只警告不失败', async () => {
      const api = createFakeApi({
         'GET /api/trpc/auth.login.getUser': () =>
            trpcError('Required authentication', { status: 401 }),
      });
      const { ctx, harness } = await createTestContext({
         cwd: exampleDir(),
         env: { QUANTA_CONFIG_DIR: CONFIG_DIR },
         fetch: api.fetch,
      });

      await runDoctor(ctx);
      expect(harness.out()).toContain('未登录');
   });
});
