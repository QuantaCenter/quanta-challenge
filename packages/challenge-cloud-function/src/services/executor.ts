import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { build as esbuildBuild } from 'esbuild';
import { config } from '../config';
import {
   CloudFunctionError,
   fail,
   type CloudFunctionErrorCode,
} from '../utils/errors';
import { logger } from '../utils/logger';
import type { CloudFunctionKv } from './kv';
import type { CloudFunctionUser, RunPayload, WorkerOutbound } from '../runtime/protocol';

export interface ExecutionJob {
   functionId: string;
   name: string;
   version: number;
   code: string;
   input: unknown;
   user: CloudFunctionUser | null;
   timeoutMs: number;
   kv: CloudFunctionKv;
   traceId?: string;
}

const KNOWN_ERROR_CODES = new Set<string>([
   'UNAUTHORIZED',
   'FORBIDDEN',
   'REPLAY_DETECTED',
   'FUNCTION_NOT_FOUND',
   'FUNCTION_DISABLED',
   'FUNCTION_NOT_PUBLISHED',
   'INVALID_INPUT',
   'COMPILE_ERROR',
   'TIMEOUT',
   'OOM',
   'RUNTIME_ERROR',
   'KV_QUOTA_EXCEEDED',
   'FUNCTION_BUSY',
   'INTERNAL_ERROR',
]);

/**
 * 定位 Worker 源码。
 *
 * 本文件在 `src/services/`（开发）或 `dist/services/`（生产），而 Worker 在
 * `src/runtime/`（开发，TS，由 vite dev server 托管）或 `dist/runtime/`（生产，JS）——
 * 因此要从当前目录的**上一级**找。另外补一个 cwd 兜底：`pnpm dev` 的工作目录是包根目录，
 * 无论 `import.meta.url` 被 vite 改写成什么都能命中。
 */
const resolveWorkerSource = (): string => {
   const dir = path.dirname(fileURLToPath(import.meta.url));
   const candidates = [
      path.join(dir, '..', 'runtime', 'worker.js'),
      path.join(dir, '..', 'runtime', 'worker.ts'),
      path.join(process.cwd(), 'src', 'runtime', 'worker.ts'),
      path.join(process.cwd(), 'dist', 'runtime', 'worker.js'),
   ];
   for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
   }
   throw new Error(`找不到 Worker 源码，尝试过：${candidates.join(' | ')}`);
};

let workerScriptPromise: Promise<string> | null = null;

/**
 * 用 esbuild 把 Worker 源码单独编译成一个临时 ESM 文件。
 *
 * 为什么不直接用 worker 源文件路径：`.ts` 无法被 `new Worker()` 直接加载；
 * 为什么不 import 它：Worker 必须作为**独立入口**运行，不能跟服务主线程共享模块实例。
 */
export const prepareWorkerScript = (): Promise<string> => {
   if (workerScriptPromise) return workerScriptPromise;

   workerScriptPromise = (async () => {
      const source = resolveWorkerSource();
      const outfile = path.join(
         os.tmpdir(),
         `cf-worker-${process.pid}-${Date.now()}.mjs`,
      );
      await esbuildBuild({
         entryPoints: [source],
         outfile,
         bundle: true,
         platform: 'node',
         format: 'esm',
         target: 'node20',
         logLevel: 'silent',
         external: ['node:*'],
      });
      logger.info({ source, outfile }, '沙箱 Worker 已编译');
      return outfile;
   })();

   return workerScriptPromise;
};

class WorkerHandle {
   readonly worker: Worker;
   invocations = 0;

   private current: {
      job: ExecutionJob;
      timer: NodeJS.Timeout;
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      settled: boolean;
   } | null = null;

   constructor(
      script: string,
      private readonly onFatal: (handle: WorkerHandle) => void,
   ) {
      this.worker = new Worker(script, {
         resourceLimits: {
            maxOldGenerationSizeMb: config.worker.memoryMb,
            maxYoungGenerationSizeMb: Math.max(
               16,
               Math.floor(config.worker.memoryMb / 4),
            ),
            stackSizeMb: 4,
         },
      });

      this.worker.on('message', (message: WorkerOutbound) =>
         this.handleMessage(message),
      );
      this.worker.on('error', (error) => this.handleFatal(error));
      this.worker.on('exit', (code) => {
         if (code !== 0) {
            this.handleFatal(new Error(`Worker 非正常退出（code=${code}）`));
         }
      });
   }

   run(job: ExecutionJob): Promise<unknown> {
      return new Promise((resolve, reject) => {
         const timer = setTimeout(() => {
            this.fail(
               new CloudFunctionError(
                  'TIMEOUT',
                  `云函数执行超时（${job.timeoutMs}ms）`,
               ),
               true,
            );
         }, job.timeoutMs);

         this.current = { job, timer, resolve, reject, settled: false };
         this.invocations += 1;

         const payload: RunPayload = {
            name: job.name,
            version: job.version,
            code: job.code,
            input: job.input,
            user: job.user,
            timeoutMs: job.timeoutMs,
            syncTimeoutMs: Math.min(job.timeoutMs, 1000),
         };

         this.worker.postMessage({ type: 'run', payload });
      });
   }

   terminate(): void {
      this.fail(
         new CloudFunctionError('INTERNAL_ERROR', 'Worker 已被回收'),
         false,
      );
      void this.worker.terminate();
   }

   private handleMessage(message: WorkerOutbound): void {
      if (message.type === 'log') {
         const current = this.current;
         logger[message.level](
            { fn: current?.job.name, version: current?.job.version, data: message.data },
            message.message,
         );
         return;
      }

      if (message.type === 'kv') {
         const current = this.current;
         if (!current) return;
         current.job.kv.handle(message.op, message.args).then(
            (value) =>
               this.worker.postMessage({
                  type: 'kv:result',
                  id: message.id,
                  ok: true,
                  value,
               }),
            (error: unknown) =>
               this.worker.postMessage({
                  type: 'kv:result',
                  id: message.id,
                  ok: false,
                  error: error instanceof Error ? error.message : String(error),
                  code:
                     error instanceof CloudFunctionError
                        ? error.code
                        : undefined,
               }),
         );
         return;
      }

      if (message.type === 'result') {
         if (message.ok) {
            this.resolve(message.data);
            return;
         }

         const code = message.error?.code;
         const mapped: CloudFunctionErrorCode =
            code && KNOWN_ERROR_CODES.has(code)
               ? (code as CloudFunctionErrorCode)
               : 'RUNTIME_ERROR';

         this.fail(new CloudFunctionError(mapped, message.error?.message ?? '云函数执行失败'), false);
      }
   }

   private handleFatal(error: Error): void {
      const isOom =
         (error as { code?: string }).code === 'ERR_WORKER_OUT_OF_MEMORY' ||
         /out of memory/i.test(error.message);

      this.fail(
         isOom
            ? new CloudFunctionError('OOM', '云函数内存超限')
            : new CloudFunctionError(
                 'RUNTIME_ERROR',
                 `云函数执行进程异常：${error.message}`,
              ),
         true,
      );
   }

   private resolve(value: unknown): void {
      const current = this.current;
      if (!current || current.settled) return;
      current.settled = true;
      clearTimeout(current.timer);
      this.current = null;
      current.resolve(value);
   }

   private fail(error: Error, fatal: boolean): void {
      const current = this.current;
      if (!current || current.settled) {
         if (fatal) this.onFatal(this);
         return;
      }
      current.settled = true;
      clearTimeout(current.timer);
      this.current = null;
      current.reject(error);
      if (fatal) this.onFatal(this);
   }
}

class Executor {
   private script: string | null = null;
   private idle: WorkerHandle[] = [];
   private readonly all = new Set<WorkerHandle>();
   private waiters: ((handle: WorkerHandle) => void)[] = [];
   private readonly perFunction = new Map<string, number>();

   async init(): Promise<void> {
      this.script = await prepareWorkerScript();
   }

   get stats() {
      return {
         idle: this.idle.length,
         busy: this.all.size - this.idle.length,
         total: this.all.size,
         queued: this.waiters.length,
      };
   }

   async execute(job: ExecutionJob): Promise<unknown> {
      const active = this.perFunction.get(job.functionId) ?? 0;
      if (active >= config.worker.maxConcurrencyPerFunction) {
         fail(
            'FUNCTION_BUSY',
            `函数并发数超过上限 ${config.worker.maxConcurrencyPerFunction}`,
         );
      }
      this.perFunction.set(job.functionId, active + 1);

      try {
         const handle = await this.acquire();
         try {
            return await handle.run(job);
         } finally {
            this.release(handle);
         }
      } finally {
         const remaining = (this.perFunction.get(job.functionId) ?? 1) - 1;
         if (remaining <= 0) this.perFunction.delete(job.functionId);
         else this.perFunction.set(job.functionId, remaining);
      }
   }

   async destroy(): Promise<void> {
      for (const handle of [...this.all]) {
         handle.terminate();
      }
      this.all.clear();
      this.idle = [];
      for (const waiter of this.waiters) {
         // 唤醒排队者并让它立刻被回收；调用方会收到 Worker 已回收错误。
         waiter(this.create());
      }
      this.waiters = [];
   }

   private acquire(): Promise<WorkerHandle> {
      const idle = this.idle.pop();
      if (idle) return Promise.resolve(idle);

      if (this.all.size < config.worker.poolSize) {
         return Promise.resolve(this.create());
      }

      if (this.waiters.length >= config.worker.queueMax) {
         return Promise.reject(
            new CloudFunctionError(
               'FUNCTION_BUSY',
               '云函数服务繁忙，请稍后重试',
            ),
         );
      }

      return new Promise<WorkerHandle>((resolve) => this.waiters.push(resolve));
   }

   private create(): WorkerHandle {
      if (!this.script) {
         throw new Error('Executor 未初始化');
      }
      const handle = new WorkerHandle(this.script, (h) => this.discard(h));
      this.all.add(handle);
      return handle;
   }

   private release(handle: WorkerHandle): void {
      if (!this.all.has(handle)) return;

      if (handle.invocations >= config.worker.recycleAfter) {
         this.discard(handle);
         return;
      }

      const waiter = this.waiters.shift();
      if (waiter) waiter(handle);
      else this.idle.push(handle);
   }

   private discard(handle: WorkerHandle): void {
      if (this.all.has(handle)) {
         this.all.delete(handle);
         const index = this.idle.indexOf(handle);
         if (index >= 0) this.idle.splice(index, 1);
         handle.terminate();
      }
      this.pump();
   }

   private pump(): void {
      while (
         this.waiters.length > 0 &&
         this.all.size < config.worker.poolSize
      ) {
         const waiter = this.waiters.shift();
         if (!waiter) break;
         waiter(this.create());
      }
   }
}

export const executor = new Executor();
