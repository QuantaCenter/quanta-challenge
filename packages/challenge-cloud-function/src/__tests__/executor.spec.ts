import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileFunction } from '../services/compiler';
import { executor, type ExecutionJob } from '../services/executor';
import type { CloudFunctionKv } from '../services/kv';

/** 用内存 Map 顶替 Redis，专注验证沙箱执行链。 */
const createFakeKv = (): CloudFunctionKv => {
   const store = new Map<string, unknown>();
   const kv = {
      async handle(op: string, args: unknown[]): Promise<unknown> {
         switch (op) {
            case 'get':
               return store.get(args[0] as string) ?? null;
            case 'set':
               store.set(args[0] as string, args[1]);
               return undefined;
            case 'incr': {
               const next =
                  ((store.get(args[0] as string) as number) ?? 0) +
                  ((args[1] as number) ?? 1);
               store.set(args[0] as string, next);
               return next;
            }
            default:
               throw new Error(`fake kv 未实现操作：${op}`);
         }
      },
   };
   return kv as unknown as CloudFunctionKv;
};

const makeJob = async (
   source: string,
   overrides: Partial<ExecutionJob> = {},
): Promise<ExecutionJob> => {
   const { code } = await compileFunction(source, overrides.name ?? 'demo');
   return {
      functionId: 'fn-1',
      name: 'demo',
      version: 1,
      code,
      input: null,
      user: null,
      timeoutMs: 5000,
      kv: createFakeKv(),
      ...overrides,
   };
};

beforeAll(async () => {
   await executor.init();
});

afterAll(async () => {
   await executor.destroy();
});

describe('执行引擎（Worker + vm 沙箱）', () => {
   it('可读写 KV，并拿到 input 与 user', async () => {
      const job = await makeJob(
         `export default async function (ctx) {
            const n = await ctx.kv.incr('counter', 1);
            const msg = ctx.requireInput(['msg']).msg;
            await ctx.kv.set('last', msg);
            return { n, msg, last: await ctx.kv.get('last'), uid: ctx.user?.id ?? null };
         }`,
         {
            input: { msg: 'hello' },
            user: { id: 'u1', name: 'U', role: 'USER' },
         },
      );

      const result = (await executor.execute(job)) as Record<string, unknown>;
      expect(result.n).toBe(1);
      expect(result.msg).toBe('hello');
      expect(result.last).toBe('hello');
      expect(result.uid).toBe('u1');
   });

   it('沙箱内没有 require / process / fetch', async () => {
      const job = await makeJob(
         `export default function () {
            return {
               hasRequire: typeof require,
               hasProcess: typeof process,
               hasFetch: typeof fetch,
            };
         }`,
      );
      const result = (await executor.execute(job)) as Record<string, unknown>;
      expect(result.hasRequire).toBe('undefined');
      expect(result.hasProcess).toBe('undefined');
      expect(result.hasFetch).toBe('undefined');
   });

   it('requireUser 在无用户时返回 INVALID_INPUT', async () => {
      const job = await makeJob(
         `export default function (ctx) { return ctx.requireUser().id; }`,
      );
      await expect(executor.execute(job)).rejects.toMatchObject({
         code: 'INVALID_INPUT',
      });
   });

   it('函数抛错映射为 RUNTIME_ERROR', async () => {
      const job = await makeJob(
         `export default function () { throw new Error('boom'); }`,
      );
      await expect(executor.execute(job)).rejects.toMatchObject({
         code: 'RUNTIME_ERROR',
      });
   });

   it('死循环被硬超时中断（主线程 terminate）', async () => {
      const job = await makeJob(
         `export default function () { while (true) {} }`,
         { name: 'loop', functionId: 'fn-loop', timeoutMs: 500 },
      );
      await expect(executor.execute(job)).rejects.toMatchObject({
         code: 'TIMEOUT',
      });
   }, 20_000);
});
