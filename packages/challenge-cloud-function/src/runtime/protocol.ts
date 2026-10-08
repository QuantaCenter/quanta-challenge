/**
 * 主线程 ↔ Worker 的消息协议。
 *
 * 类型定义单独放一份，Worker 与 Executor 共享，避免两边字段写歪。
 * 本文件只有类型，编译后不产生运行时代码。
 */

export interface CloudFunctionUser {
   id: string;
   name: string;
   role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
}

export interface RunPayload {
   name: string;
   version: number;
   code: string;
   input: unknown;
   user: CloudFunctionUser | null;
   /** 整体执行超时（含异步），主线程计时并强制 terminate。 */
   timeoutMs: number;
   /** 顶层同步执行超时（vm.Script 的 timeout 选项）。 */
   syncTimeoutMs: number;
}

export interface RunMessage {
   type: 'run';
   payload: RunPayload;
}

export interface KvRequestMessage {
   type: 'kv';
   id: number;
   op: string;
   args: unknown[];
}

export interface KvResultMessage {
   type: 'kv:result';
   id: number;
   ok: boolean;
   value?: unknown;
   error?: string;
   code?: string;
}

export interface LogMessage {
   type: 'log';
   level: 'debug' | 'info' | 'warn' | 'error';
   message: string;
   data?: unknown;
}

export interface ResultMessage {
   type: 'result';
   ok: boolean;
   data?: unknown;
   error?: { message: string; stack?: string; code?: string };
}

export type WorkerInbound = RunMessage | KvResultMessage;
export type WorkerOutbound = ResultMessage | KvRequestMessage | LogMessage;
