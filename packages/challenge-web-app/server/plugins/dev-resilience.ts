/** 开发期连接层错误兜底：HMR/预览 socket 断开属正常噪声；给每个新 TCP 连接挂 error 监听就地消费，进程级处理器只记日志、绝不重抛或退出。 */
const IGNORABLE_SOCKET_CODES = new Set([
   'ECONNRESET',
   'ECONNABORTED',
   'EPIPE',
   'ERR_STREAM_WRITE_AFTER_END',
   'ERR_STREAM_DESTROYED',
]);

const errorCode = (e: unknown): string | undefined =>
   (e as NodeJS.ErrnoException | undefined)?.code;

const isIgnorableSocketError = (e: unknown): boolean => {
   const code = errorCode(e);
   return typeof code === 'string' && IGNORABLE_SOCKET_CODES.has(code);
};
const DEDUP_WINDOW_MS = 30_000;

export default defineNitroPlugin(() => {
   // 只在开发环境启用；生产环境的连接错误应由正式日志/监控处理
   if (process.env.NODE_ENV === 'production') return;

   // ---- 第 1 层：源头消化 ----
   // Nitro 开发服务器会把 http server 暴露在 globalThis 上时优先使用它
   const candidates = [
      (globalThis as any).__nitro_http_server,
      (globalThis as any).httpServer,
      (globalThis as any).__nuxt_http_server,
   ].filter(Boolean);

   let attached = 0;
   for (const server of candidates) {
      if (typeof server.on !== 'function') continue;
      server.on('connection', (socket: any) => {
         socket.on('error', (err: unknown) => {
            if (isIgnorableSocketError(err)) return; // 静默消化
            console.error('[dev] socket 错误:', err);
         });
      });
      attached++;
   }

   // ---- 第 2 层：进程级兜底（只记录，不抛出、不退出） ----
   process.on('unhandledRejection', (reason) => {
      if (isIgnorableSocketError(reason)) return; // 连接噪声，无需刷屏
      console.error('[dev] 未处理的 Promise 拒绝（已忽略，服务继续运行）:', reason);
   });

   process.on('uncaughtException', (error) => {
      if (isIgnorableSocketError(error)) return;
      console.error('[dev] 未捕获异常（已忽略，服务继续运行）:', error);
   });

   console.log(
      `[dev] 连接层错误兜底已启用（已挂接 ${attached} 个 http server；` +
         'ECONNRESET / ECONNABORTED / EPIPE 不再终止 dev server）',
   );
});
