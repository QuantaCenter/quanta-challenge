#!/usr/bin/env node
import { runCli } from './cli';
import { createProcessRuntime, installSignalHandlers } from './core/runtime';

/**
 * bin 入口：只做三件事 —— 组装运行时、跑 CLI、把退出码交给 shell。
 *
 * 这里才允许有副作用（安装信号处理、设置 exitCode）；
 * 所有业务逻辑都在 cli.ts 之下，因此可以被单元测试直接调用。
 */
const runtime = createProcessRuntime();
const { controller, dispose } = installSignalHandlers(runtime);

const exitCode = await runCli(process.argv, {
   ...runtime,
   signal: controller.signal,
});
dispose();
process.exitCode = exitCode;
