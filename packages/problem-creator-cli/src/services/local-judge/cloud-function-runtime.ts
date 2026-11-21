import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { compileFunction } from '@challenge/shared/cloud-function-compiler';
import {
   CloudFunctionError,
   isCloudFunctionErrorCode,
} from '@challenge/shared/cloud-function-errors';
import { build } from 'esbuild';
import type {
   CloudFunctionUser,
   WorkerInbound,
   WorkerOutbound,
} from '../../../../challenge-cloud-function/src/runtime/protocol';

export { CloudFunctionError };

const TIMEOUT_MS = 5_000;
const MAX_CONCURRENT_INVOCATIONS = 16;
const LOCAL_USER: CloudFunctionUser = {
   id: 'qpc-local-user',
   name: 'qpc-local-user',
   role: 'USER',
};

interface CompiledCloudFunction {
   name: string;
   code: string;
}

interface LocalCloudFunctionOptions {
   kv: {
      forInvocation(): {
         handle(op: string, args: unknown[]): Promise<unknown>;
      };
   };
   log?: (message: string) => void;
}

export interface LocalCloudFunction {
   invoke(input: unknown): Promise<unknown>;
   close(): Promise<void>;
}

export const compileLocalCloudFunction = async (
   source: string,
   name: string,
): Promise<CompiledCloudFunction> => {
   const { code } = await compileFunction(source, name);
   return { name, code };
};

let workerSource: Promise<string> | undefined;
const loadWorkerSource = (): Promise<string> =>
   (workerSource ??= (async () => {
      const bundled = new URL('./cloud-function-worker.cjs', import.meta.url);
      try {
         return await readFile(bundled, 'utf8');
      } catch (error) {
         if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }

      // 用 tsx 直跑源码时，编译与线上相同的 Worker 入口。
      const source = fileURLToPath(
         new URL(
            '../../../../challenge-cloud-function/src/runtime/worker.ts',
            import.meta.url,
         ),
      );
      const result = await build({
         entryPoints: [source],
         bundle: true,
         write: false,
         platform: 'node',
         format: 'cjs',
         target: 'node20',
      });
      const script = result.outputFiles[0]?.text;
      if (!script) throw new Error('无法构建本地云函数 Worker');
      return script;
   })());

/** 每次调用使用独立 Worker，可终止同步死循环和未完成的异步任务。 */
export const createLocalCloudFunction = (
   { name, code }: CompiledCloudFunction,
   { kv, log }: LocalCloudFunctionOptions,
): LocalCloudFunction => {
   const active = new Set<() => Promise<void>>();
   let closed = false;

   return {
      async invoke(input) {
         const script = await loadWorkerSource();
         if (closed) {
            throw new CloudFunctionError('INTERNAL_ERROR', '本地云函数已关闭');
         }
         if (active.size >= MAX_CONCURRENT_INVOCATIONS) {
            throw new CloudFunctionError(
               'FUNCTION_BUSY',
               '本地云函数正在处理其他请求',
            );
         }
         const store = kv.forInvocation();
         const worker = new Worker(script, {
            eval: true,
            env: {},
            execArgv: [],
            resourceLimits: {
               maxOldGenerationSizeMb: 128,
               maxYoungGenerationSizeMb: 32,
               stackSizeMb: 4,
            },
         });

         return new Promise((resolve, reject) => {
            let cleanup: Promise<void> | undefined;
            const finish = (error: Error | null, data?: unknown) => {
               if (cleanup) return cleanup;
               clearTimeout(timer);
               cleanup = worker
                  .terminate()
                  .catch(() => undefined)
                  .then(() => {
                     active.delete(cancel);
                     if (error) reject(error);
                     else resolve(data);
                  });
               return cleanup;
            };
            const cancel = () =>
               finish(
                  new CloudFunctionError('INTERNAL_ERROR', '本地云函数已关闭'),
               );
            const timer = setTimeout(() => {
               void finish(
                  new CloudFunctionError(
                     'TIMEOUT',
                     `云函数执行超时（${TIMEOUT_MS}ms）`,
                  ),
               );
            }, TIMEOUT_MS);
            active.add(cancel);

            const send = (message: WorkerInbound) => {
               if (cleanup) return;
               try {
                  worker.postMessage(message);
               } catch (error) {
                  void finish(
                     new CloudFunctionError('RUNTIME_ERROR', String(error)),
                  );
               }
            };
            worker.on('message', (message: WorkerOutbound) => {
               if (cleanup) return;
               switch (message.type) {
                  case 'log':
                     log?.(
                        `[云函数 ${name}] ${message.level}: ${message.message}`,
                     );
                     return;
                  case 'kv':
                     void store.handle(message.op, message.args).then(
                        (value) =>
                           send({
                              type: 'kv:result',
                              id: message.id,
                              ok: true,
                              value,
                           }),
                        (error: unknown) =>
                           send({
                              type: 'kv:result',
                              id: message.id,
                              ok: false,
                              error:
                                 error instanceof Error
                                    ? error.message
                                    : String(error),
                              code:
                                 error instanceof CloudFunctionError
                                    ? error.code
                                    : undefined,
                           }),
                     );
                     return;
                  case 'result': {
                     if (message.ok) {
                        void finish(null, message.data);
                        return;
                     }
                     const code = message.error?.code;
                     void finish(
                        new CloudFunctionError(
                           code && isCloudFunctionErrorCode(code)
                              ? code
                              : 'RUNTIME_ERROR',
                           message.error?.message ?? '云函数执行失败',
                        ),
                     );
                  }
               }
            });
            worker.once('error', (error: NodeJS.ErrnoException) => {
               void finish(
                  error.code === 'ERR_WORKER_OUT_OF_MEMORY'
                     ? new CloudFunctionError('OOM', '云函数内存超限')
                     : new CloudFunctionError(
                          'RUNTIME_ERROR',
                          `云函数执行进程异常：${error.message}`,
                       ),
               );
            });
            worker.once('exit', (status) => {
               void finish(
                  new CloudFunctionError(
                     'RUNTIME_ERROR',
                     `云函数执行进程已退出（${status}）`,
                  ),
               );
            });
            send({
               type: 'run',
               payload: {
                  name,
                  version: -1,
                  code,
                  input,
                  user: LOCAL_USER,
                  timeoutMs: TIMEOUT_MS,
                  syncTimeoutMs: 1000,
               },
            });
         });
      },
      async close() {
         closed = true;
         await Promise.all([...active].map((cancel) => cancel()));
      },
   };
};
