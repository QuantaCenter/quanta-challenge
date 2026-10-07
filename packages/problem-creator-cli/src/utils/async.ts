export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
   new Promise((resolve, reject) => {
      if (signal?.aborted) {
         reject(
            signal.reason instanceof Error
               ? signal.reason
               : new Error('aborted'),
         );
         return;
      }
      const timer = setTimeout(() => {
         signal?.removeEventListener('abort', onAbort);
         resolve();
      }, ms);
      const onAbort = () => {
         clearTimeout(timer);
         reject(
            signal?.reason instanceof Error
               ? signal.reason
               : new Error('aborted'),
         );
      };
      signal?.addEventListener('abort', onAbort, { once: true });
   });

export interface PollOptions<T> {
   /** 返回 undefined 表示"还没好，继续等" */
   probe: (attempt: number) => Promise<T | undefined>;
   intervalMs?: number;
   timeoutMs?: number;
   signal?: AbortSignal;
   onTick?: (elapsedMs: number, attempt: number) => void;
}

/**
 * 轮询直到 probe 返回非 undefined 或超时。
 *
 * 超时返回 undefined 而不是抛错：调用方才知道"超时意味着什么"
 * （审计超时要提示去看调度器日志，而不是当成通用失败）。
 */
export const poll = async <T>(
   options: PollOptions<T>,
): Promise<T | undefined> => {
   const intervalMs = options.intervalMs ?? 2_000;
   const timeoutMs = options.timeoutMs ?? 120_000;
   const startedAt = Date.now();
   let attempt = 0;

   for (;;) {
      attempt += 1;
      const value = await options.probe(attempt);
      if (value !== undefined) return value;

      const elapsed = Date.now() - startedAt;
      if (elapsed + intervalMs > timeoutMs) return undefined;
      options.onTick?.(elapsed, attempt);
      await sleep(intervalMs, options.signal);
   }
};
