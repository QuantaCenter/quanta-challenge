import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

/* 请求级追踪上下文 */
export interface RequestContext {
   traceId: string;
   userId?: string;
   role?: string;
}

const als = new AsyncLocalStorage<RequestContext>();

export { als as requestContextAls };

/** W3C Trace Context 格式的 trace id：32 位 hex（协议 §3 要求）。 */
export const createTraceId = (): string => randomBytes(16).toString('hex');

/** 校验是否为合法的 W3C trace id（32 位 hex）；不合法的旧格式（UUID / 16-hex）返回 false。 */
export const isValidTraceId = (
   value: string | undefined | null,
): value is string =>
   typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);

/** 以指定上下文运行回调；回调内（含穿透 await 的异步链）均可通过 getRequestContext 读取。 */
export const runWithRequestContext = <T>(
   store: RequestContext,
   fn: () => T,
): T => als.run(store, fn);

/** 取当前请求上下文；不在作用域内（如定时任务、队列回调未包裹）时返回 undefined。 */
export const getRequestContext = (): RequestContext | undefined =>
   als.getStore();
