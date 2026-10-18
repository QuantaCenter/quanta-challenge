#!/usr/bin/env node
import { runCli } from './cli';
import { createProcessRuntime, installSignalHandlers } from './core/runtime';

/** bin 入口：组装运行时、跑 CLI、把退出码交给 shell；只有这里允许有副作用。 */
const runtime = createProcessRuntime();
const { controller, dispose } = installSignalHandlers(runtime);

const exitCode = await runCli(process.argv, {
   ...runtime,
   signal: controller.signal,
});
dispose();
process.exitCode = exitCode;
