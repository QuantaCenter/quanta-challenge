/**
 * 端到端验证脚本（需要本机 PostgreSQL + Redis）。
 *
 * 用法：
 *   pnpm build
 *   npx tsx scripts/e2e.ts
 *
 * 会以子进程启动 dist/index.js（PORT=1891），然后依次验证：
 *   1. /healthz 真实反映依赖
 *   2. 创建函数 → 发布版本 → 调用
 *   3. 用户隔离：userA 与 userB 的 KV 互不可见
 *   4. 防重放：同一 nonce 第二次被拒（409）
 *   5. 判题密钥受白名单约束
 * 最后清理测试数据并退出（非 0 表示失败）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { generateCloudFunctionHeaders } from '@challenge/shared/cloud-function';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');

const PORT = 1891;
const BASE = `http://127.0.0.1:${PORT}`;
const WEBAPP_SECRET = 'e2e_webapp_secret';
const JUDGE_SECRET = 'e2e_judge_secret';
const FUNCTION_NAME = 'e2e-demo';

const dbEnv =
   dotenv.config({
      path: path.join(packageRoot, '..', 'database', '.env'),
   }).parsed ?? {};

const childEnv: NodeJS.ProcessEnv = {
   ...process.env,
   ...dbEnv,
   NODE_ENV: 'production',
   PORT: String(PORT),
   REDIS_HOST: process.env.REDIS_HOST || 'localhost',
   REDIS_PORT: process.env.REDIS_PORT || '6379',
   CF_INTERNAL_KEYS: JSON.stringify({
      'web-app': WEBAPP_SECRET,
      judge: JUDGE_SECRET,
   }),
   CF_MASTER_SECRETS: JSON.stringify({ '1': 'e2e_master_secret' }),
   CF_JUDGE_ALLOWED_FUNCTIONS: FUNCTION_NAME,
};

const server = spawn('node', [path.join(packageRoot, 'dist', 'index.js')], {
   env: childEnv,
   stdio: ['ignore', 'inherit', 'inherit'],
});

let failed = false;
const check = (label: string, condition: boolean, detail?: unknown) => {
   const mark = condition ? '✅' : '❌';
   console.log(`${mark} ${label}${condition ? '' : ` — ${JSON.stringify(detail)}`}`);
   if (!condition) failed = true;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface CallResult {
   status: number;
   json: any;
}

const call = async (
   method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
   apiPath: string,
   options: {
      body?: unknown;
      query?: Record<string, string>;
      keyId?: string;
      secret?: string;
      userId?: string;
      nonce?: string;
   } = {},
): Promise<CallResult> => {
   const keyId = options.keyId ?? 'web-app';
   const secret = options.secret ?? WEBAPP_SECRET;
   const bodyString =
      options.body === undefined ? '' : JSON.stringify(options.body);

   const headers = generateCloudFunctionHeaders({
      method,
      path: apiPath,
      query: options.query,
      body: bodyString,
      keyId,
      secret,
      userId: options.userId,
      nonce: options.nonce,
   });

   const url = new URL(BASE + apiPath);
   for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
   }

   const response = await fetch(url, {
      method,
      headers,
      body: bodyString.length > 0 ? bodyString : undefined,
   });

   let json: any = null;
   try {
      json = await response.json();
   } catch {
      json = null;
   }
   return { status: response.status, json };
};

const waitForHealth = async (): Promise<boolean> => {
   for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
         const response = await fetch(`${BASE}/healthz`);
         if (response.status === 200) return true;
      } catch {
         /* not up yet */
      }
      await sleep(500);
   }
   return false;
};

const main = async () => {
   const healthy = await waitForHealth();
   check('/healthz 就绪且依赖可用', healthy);

   // 幂等清理：上次失败可能残留同名函数（硬删，避免软删残留占用名字）。
   await call('DELETE', `/v1/functions/${FUNCTION_NAME}`, {
      query: { hard: 'true' },
   }).catch(() => undefined);

   const created = await call('POST', '/v1/functions', {
      body: { name: FUNCTION_NAME, description: 'e2e', kvUserIsolated: true },
   });
   check('创建云函数', created.status === 201, created);

   const source = `
export default async function (ctx) {
  const hits = await ctx.kv.incr('hits', 1);
  return { hits, userId: ctx.user?.id ?? null };
}
`;

   const published = await call(
      'POST',
      `/v1/functions/${FUNCTION_NAME}/versions`,
      { body: { source } },
   );
   check('发布版本', published.status === 201, published);

   const a1 = await call('POST', `/v1/invoke/${FUNCTION_NAME}`, {
      body: { input: null },
      userId: 'userA',
   });
   check('userA 首次调用 hits=1', a1.json?.data?.hits === 1, a1);

   const a2 = await call('POST', `/v1/invoke/${FUNCTION_NAME}`, {
      body: { input: null },
      userId: 'userA',
   });
   check('userA 再次调用 hits=2（同一隔离域）', a2.json?.data?.hits === 2, a2);

   const b1 = await call('POST', `/v1/invoke/${FUNCTION_NAME}`, {
      body: { input: null },
      userId: 'userB',
   });
   check('userB 首次调用 hits=1（与 userA 隔离）', b1.json?.data?.hits === 1, b1);

   // 防重放：复用同一个 nonce（每次运行用新 nonce，避开上一轮的残留）。
   const nonce = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
   const first = await call('POST', `/v1/invoke/${FUNCTION_NAME}`, {
      body: { input: null },
      userId: 'userA',
      nonce,
   });
   const replay = await call('POST', `/v1/invoke/${FUNCTION_NAME}`, {
      body: { input: null },
      userId: 'userA',
      nonce,
   });
   check('首次请求成功', first.status === 200, first);
   check('相同 nonce 重放被拒（409）', replay.status === 409, replay);

   // 判题密钥：白名单内可调用。
   const judgeOk = await call('POST', `/v1/invoke/${FUNCTION_NAME}`, {
      body: { input: null },
      keyId: 'judge',
      secret: JUDGE_SECRET,
   });
   check('判题密钥可调用白名单内函数', judgeOk.status === 200, judgeOk);

   // 判题密钥：白名单外被拒。
   const judgeDenied = await call('POST', '/v1/invoke/not-allowed', {
      body: { input: null },
      keyId: 'judge',
      secret: JUDGE_SECRET,
   });
   check('判题密钥调用白名单外函数被拒（403）', judgeDenied.status === 403, judgeDenied);

   // 清理
   await call('DELETE', `/v1/functions/${FUNCTION_NAME}`, {
      query: { hard: 'true' },
   });
};

main()
   .catch((error) => {
      console.error('❌ e2e 异常：', error);
      failed = true;
   })
   .finally(async () => {
      server.kill('SIGTERM');
      await sleep(500);
      server.kill('SIGKILL');
      console.log(failed ? '\n❌ E2E FAILED' : '\n✅ E2E PASSED');
      process.exit(failed ? 1 : 0);
   });
