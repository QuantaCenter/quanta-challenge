import type { FetchLike } from '../services/http';
import { CanceledError } from './errors';

/**
 * 运行环境的一切外部依赖都从 runtime 取，**不直接读 process**。
 * 这样单元测试可以注入临时 cwd、假 fetch、捕获输出，
 * 不需要真的起进程或 mock 全局对象。
 */
export interface CliRuntime {
   cwd: string;
   env: NodeJS.ProcessEnv;
   stdin: NodeJS.ReadStream;
   stdout: (chunk: string) => void;
   stderr: (chunk: string) => void;
   fetch: FetchLike;
   now: () => number;
   signal?: AbortSignal;
   /** 默认取 process.stdout.isTTY */
   isTTY?: boolean;
}

export const createProcessRuntime = (
   overrides: Partial<CliRuntime> = {},
): CliRuntime => ({
   cwd: process.cwd(),
   env: process.env,
   stdin: process.stdin,
   stdout: (chunk) => process.stdout.write(chunk),
   stderr: (chunk) => process.stderr.write(chunk),
   fetch: ((input: string, init?: RequestInit) =>
      globalThis.fetch(input, init)) as FetchLike,
   now: () => Date.now(),
   isTTY: Boolean(process.stdout.isTTY),
   ...overrides,
});

/**
 * 安装 Ctrl-C 处理。
 *
 * 第一次 SIGINT：abort，让正在跑的请求与轮询尽快结束（而不是等 15s 超时）。
 * 第二次 SIGINT：用户明显不想等了，直接退出。
 * 不这样做的话，`qpc upload --wait` 期间按 Ctrl-C 会被 fetch 的超时吞掉，
 * 终端看起来"没反应"。
 */
export const installSignalHandlers = (
   runtime: CliRuntime,
): { controller: AbortController; dispose: () => void } => {
   const controller = new AbortController();
   let interrupts = 0;
   const onSignal = () => {
      interrupts += 1;
      if (interrupts > 1) {
         runtime.stderr('\n再次收到中断信号，立即退出。\n');
         process.exit(130);
      }
      runtime.stderr('\n正在取消…（再按一次 Ctrl-C 强制退出）\n');
      controller.abort(new CanceledError('已取消（Ctrl-C）'));
   };
   process.on('SIGINT', onSignal);
   process.on('SIGTERM', onSignal);
   return {
      controller,
      dispose: () => {
         process.removeListener('SIGINT', onSignal);
         process.removeListener('SIGTERM', onSignal);
      },
   };
};
