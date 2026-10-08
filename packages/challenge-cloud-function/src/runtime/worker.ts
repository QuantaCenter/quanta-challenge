import vm from 'node:vm';
import { parentPort } from 'node:worker_threads';
import type {
   KvResultMessage,
   LogMessage,
   ResultMessage,
   RunPayload,
   WorkerInbound,
   WorkerOutbound,
} from './protocol';

/**
 * 沙箱 Worker。
 *
 * 隔离模型与威胁模型（务必与 DESIGN.md §3.4 一起阅读）：
 *   · 代码由**管理员**发布，因此本 Worker 的目标不是"防恶意逃逸"，
 *     而是防"误伤"：死循环、内存膨胀、越界读写 KV。
 *   · 硬超时由主线程 terminate 完成；这里只管执行与 KV RPC。
 *   · vm 用 `codeGeneration: { strings:false, wasm:false }` 关闭 eval/Function 动态代码。
 *   · 沙箱内不注入 require / process / fetch / 定时器，只有纯计算全局与 KV/日志 API。
 */

const port = parentPort;
if (!port) {
   throw new Error('cloud-function worker 必须在 worker_threads 中运行');
}

const post = (message: WorkerOutbound): void => port.postMessage(message);

// ── KV RPC：沙箱内的 kv.* 最终转成一条消息发给主线程 ──────────────────────────
const pendingKv = new Map<
   number,
   { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
let kvSeq = 0;

const kvCall = (op: string, args: unknown[]): Promise<unknown> =>
   new Promise((resolve, reject) => {
      const id = ++kvSeq;
      pendingKv.set(id, { resolve, reject });
      post({ type: 'kv', id, op, args });
   });

const kvApi = {
   get: (key: string) => kvCall('get', [key]),
   set: (key: string, value: unknown, options?: unknown) =>
      kvCall('set', [key, value, options ?? {}]),
   del: (key: string) => kvCall('del', [key]),
   has: (key: string) => kvCall('has', [key]),
   incr: (key: string, by = 1) => kvCall('incr', [key, by]),
   expire: (key: string, ttlSeconds: number) =>
      kvCall('expire', [key, ttlSeconds]),
   ttl: (key: string) => kvCall('ttl', [key]),
   keys: (pattern = '*') => kvCall('keys', [pattern]),
   mget: (keys: string[]) => kvCall('mget', [keys]),
   mset: (entries: unknown[]) => kvCall('mset', [entries]),
   clear: () => kvCall('clear', []),
};

const makeLog =
   (level: LogMessage['level']) =>
   (message: unknown, data?: unknown): void => {
      post({ type: 'log', level, message: String(message), data });
   };

/** 允许带入沙箱的纯计算全局；不含任何 IO/进程/网络能力。 */
const SAFE_GLOBALS = [
   'TextEncoder',
   'TextDecoder',
   'URL',
   'URLSearchParams',
   'structuredClone',
   'atob',
   'btoa',
] as const;

const runJob = async (payload: RunPayload): Promise<unknown> => {
   const log = {
      debug: makeLog('debug'),
      info: makeLog('info'),
      warn: makeLog('warn'),
      error: makeLog('error'),
   };

   const ctx = {
      input: payload.input,
      user: payload.user,
      kv: kvApi,
      log,
      fn: { name: payload.name, version: payload.version },
      requireUser() {
         if (!payload.user) {
            const error = new Error('该云函数需要登录用户才能调用');
            (error as { cfCode?: string }).cfCode = 'INVALID_INPUT';
            throw error;
         }
         return payload.user;
      },
      requireInput(requiredKeys: string[]) {
         const value = payload.input;
         if (
            value === null ||
            typeof value !== 'object' ||
            Array.isArray(value)
         ) {
            const error = new Error('该云函数需要一个对象类型的 input');
            (error as { cfCode?: string }).cfCode = 'INVALID_INPUT';
            throw error;
         }
         for (const key of requiredKeys) {
            if (!(key in (value as Record<string, unknown>))) {
               const error = new Error(`input 缺少必需字段：${key}`);
               (error as { cfCode?: string }).cfCode = 'INVALID_INPUT';
               throw error;
            }
         }
         return value;
      },
   };

   const moduleObject: { exports: unknown } = { exports: {} };
   const sandbox: Record<string, unknown> = {
      module: moduleObject,
      exports: moduleObject.exports,
      console: {
         log: log.info,
         info: log.info,
         warn: log.warn,
         error: log.error,
         debug: log.debug,
      },
   };

   const context = vm.createContext(sandbox, {
      name: `${payload.name}@${payload.version}`,
      codeGeneration: { strings: false, wasm: false },
   });

   for (const key of SAFE_GLOBALS) {
      const value = (globalThis as Record<string, unknown>)[key];
      if (typeof value !== 'undefined') {
         (context as Record<string, unknown>)[key] = value;
      }
   }

   const script = new vm.Script(`"use strict";\n${payload.code}`, {
      filename: `${payload.name}@${payload.version}.js`,
   });
   // 顶层（通常只是模块定义）同步执行；给它一个同步超时兜底。
   script.runInContext(context, { timeout: payload.syncTimeoutMs });

   const exported = moduleObject.exports as
      | { default?: unknown; handler?: unknown }
      | ((...args: unknown[]) => unknown)
      | null;

   const handler =
      typeof exported === 'function'
         ? exported
         : (exported?.default ?? exported?.handler);

   if (typeof handler !== 'function') {
      const error = new Error(
         '云函数必须导出默认函数（export default async function (ctx) { ... }）',
      );
      (error as { cfCode?: string }).cfCode = 'COMPILE_ERROR';
      throw error;
   }

   return await handler(ctx);
};

port.on('message', (message: WorkerInbound) => {
   if (message.type === 'kv:result') {
      const pending = pendingKv.get((message as KvResultMessage).id);
      if (!pending) return;
      pendingKv.delete(message.id);
      if (message.ok) {
         pending.resolve(message.value);
      } else {
         const error = new Error(message.error ?? 'KV 操作失败');
         (error as { cfCode?: string }).cfCode = message.code;
         pending.reject(error);
      }
      return;
   }

   if (message.type === 'run') {
      runJob(message.payload)
         .then((data) => post({ type: 'result', ok: true, data }))
         .catch((error: unknown) => {
            const err = error as {
               message?: string;
               stack?: string;
               cfCode?: string;
            };
            const result: ResultMessage = {
               type: 'result',
               ok: false,
               error: {
                  message: err?.message ?? String(error),
                  stack: err?.stack,
                  code: err?.cfCode,
               },
            };
            post(result);
         });
   }
});
