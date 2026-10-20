import { type ChildProcess, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { join } from 'node:path';

import type { Browser } from 'playwright-core';

import type { ResolvedProblemConfig } from '../../domain/problem-config';
import { pathExists, readText } from '../../utils/fs';
import { launchHeadlessBrowser } from './headless-browser';
import {
   type CheckPointResult,
   LocalHttpClient,
   NAVIGATE_TIMEOUT_MS,
   runJudgeScript,
} from './sandbox';
import { startStaticServer } from './static-server';

export type LocalJudgeLabel = 'answer' | 'template';

export interface LocalJudgeRun {
   label: LocalJudgeLabel;
   /** 本次实际得分（脚本级失败时为 0） */
   score: number;
   totalScore: number;
   durationMs: number;
   results: CheckPointResult[];
   /** 脚本级失败：线上会让所有检查点作废 */
   error?: string;
}

export interface LocalJudgeOutcome {
   /** 环境不满足时跳过（没有浏览器、依赖未安装），附原因与建议 */
   skipped?: { reason: string; hint: string };
   runs: LocalJudgeRun[];
}

const SERVICE_READY_TIMEOUT_MS = 15_000;

/** 本地微判题：分别对 answer 与 template 跑一遍判题脚本，语义对齐线上判题机。 */
export const runLocalJudge = async (
   config: ResolvedProblemConfig,
   totalScore: number,
   log: (message: string) => void,
): Promise<LocalJudgeOutcome> => {
   const code = await readText(config.paths.judge);
   const targets: Array<{ label: LocalJudgeLabel; dir: string }> = [
      { label: 'answer', dir: config.paths.answer },
      { label: 'template', dir: config.paths.template },
   ];

   if (config.type === 'backend_service') {
      for (const { dir, label } of targets) {
         const missing = await missingDependencies(dir);
         if (missing) {
            return {
               skipped: {
                  reason: `${label}/ 声明了依赖但没有安装（node_modules 不存在）`,
                  hint: `在 ${label}/ 下执行 \`pnpm install\` 后重跑；只想做静态检查用 \`qpc check --no-run\`。`,
               },
               runs: [],
            };
         }
      }
      const runs: LocalJudgeRun[] = [];
      for (const { label, dir } of targets) {
         runs.push(await runBackend(label, dir, code, config, totalScore, log));
      }
      return { runs };
   }

   let browser: Browser;
   try {
      browser = await launchHeadlessBrowser();
   } catch (error) {
      const hint =
         (error as { hint?: string }).hint ??
         '安装 Chromium 后重跑，或用 `qpc check --no-run` 只做静态检查。';
      return {
         skipped: { reason: '找不到可用的无头浏览器', hint },
         runs: [],
      };
   }
   try {
      const runs: LocalJudgeRun[] = [];
      for (const { label, dir } of targets) {
         runs.push(
            await runFrontend(label, dir, code, browser, totalScore, log),
         );
      }
      return { runs };
   } finally {
      await browser.close().catch(() => {});
   }
};

const runFrontend = async (
   label: LocalJudgeLabel,
   dir: string,
   code: string,
   browser: Browser,
   totalScore: number,
   log: (message: string) => void,
): Promise<LocalJudgeRun> => {
   const site = await startStaticServer(dir);
   const context = await browser.newContext();
   const startedAt = Date.now();
   try {
      const page = await context.newPage();
      page.setDefaultTimeout(NAVIGATE_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(NAVIGATE_TIMEOUT_MS);
      await page.goto(site.url, {
         timeout: NAVIGATE_TIMEOUT_MS,
         waitUntil: 'domcontentloaded',
      });
      const result = await runJudgeScript(
         code,
         { kind: 'frontend', page },
         log,
      );
      return {
         label,
         score: result.score,
         totalScore,
         durationMs: Date.now() - startedAt,
         results: result.results,
      };
   } catch (error) {
      return failedRun(label, totalScore, startedAt, error);
   } finally {
      await context.close().catch(() => {});
      await site.close();
   }
};

const runBackend = async (
   label: LocalJudgeLabel,
   dir: string,
   code: string,
   config: ResolvedProblemConfig,
   totalScore: number,
   log: (message: string) => void,
): Promise<LocalJudgeRun> => {
   const port = (await isPortFree(config.runtime.servicePort))
      ? config.runtime.servicePort
      : await freePort();
   const startedAt = Date.now();
   const service = startService(dir, port);
   try {
      await waitForService(service, port);
      const http = new LocalHttpClient(`http://127.0.0.1:${port}`);
      const result = await runJudgeScript(code, { kind: 'backend', http }, log);
      return {
         label,
         score: result.score,
         totalScore,
         durationMs: Date.now() - startedAt,
         results: result.results,
      };
   } catch (error) {
      return failedRun(label, totalScore, startedAt, error);
   } finally {
      await stopService(service);
   }
};

const failedRun = (
   label: LocalJudgeLabel,
   totalScore: number,
   startedAt: number,
   error: unknown,
): LocalJudgeRun => ({
   label,
   score: 0,
   totalScore,
   durationMs: Date.now() - startedAt,
   results: [],
   error: error instanceof Error ? error.message : String(error),
});

const missingDependencies = async (dir: string): Promise<boolean> => {
   const manifest = join(dir, 'package.json');
   if (!(await pathExists(manifest))) return false;
   try {
      const pkg = JSON.parse(await readFile(manifest, 'utf8')) as {
         dependencies?: Record<string, string>;
      };
      const hasDeps = Object.keys(pkg.dependencies ?? {}).length > 0;
      return hasDeps && !(await pathExists(join(dir, 'node_modules')));
   } catch {
      return false;
   }
};

interface RunningService {
   child: ChildProcess;
   output: string[];
   exited: Promise<number | null>;
}

/** 与线上镜像一致：在工程目录里 `npm start`，端口通过 PORT / QUANTA_PORT 注入。 */
const startService = (dir: string, port: number): RunningService => {
   const child = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['start'],
      {
         cwd: dir,
         env: { ...process.env, PORT: String(port), QUANTA_PORT: String(port) },
         stdio: ['ignore', 'pipe', 'pipe'],
         detached: process.platform !== 'win32',
      },
   );
   const output: string[] = [];
   const collect = (chunk: Buffer) => {
      output.push(...chunk.toString('utf8').split('\n').filter(Boolean));
      if (output.length > 20) output.splice(0, output.length - 20);
   };
   child.stdout?.on('data', collect);
   child.stderr?.on('data', collect);
   const exited = new Promise<number | null>((resolve) => {
      child.once('exit', (code) => resolve(code));
      child.once('error', () => resolve(-1));
   });
   return { child, output, exited };
};

const waitForService = async (
   service: RunningService,
   port: number,
): Promise<void> => {
   const deadline = Date.now() + SERVICE_READY_TIMEOUT_MS;
   let exitCode: number | null | undefined;
   void service.exited.then((code) => {
      exitCode = code;
   });
   while (Date.now() < deadline) {
      if (exitCode !== undefined) {
         throw new Error(
            `服务进程提前退出（退出码 ${exitCode}）：${service.output.slice(-5).join(' | ') || '<无输出>'}`,
         );
      }
      if (await canConnect(port)) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
   }
   throw new Error(
      `服务在 ${SERVICE_READY_TIMEOUT_MS / 1000}s 内没有监听端口 ${port}（服务应读取 PORT 环境变量）：${service.output.slice(-5).join(' | ') || '<无输出>'}`,
   );
};

/** 结束整个进程组（npm start 会再派生 node 子进程），等它真正退出，避免下一轮连到旧服务。 */
const stopService = async (service: RunningService): Promise<void> => {
   const { child } = service;
   if (child.exitCode !== null || child.pid === undefined) return;
   const signal = (name: NodeJS.Signals) => {
      try {
         if (process.platform === 'win32') child.kill(name);
         else process.kill(-(child.pid as number), name);
      } catch {
         child.kill(name);
      }
   };
   signal('SIGTERM');
   let timer: NodeJS.Timeout | undefined;
   const exited = await Promise.race([
      service.exited.then(() => true),
      new Promise<boolean>((resolve) => {
         timer = setTimeout(() => resolve(false), 3_000);
      }),
   ]);
   clearTimeout(timer);
   if (!exited) signal('SIGKILL');
};

const canConnect = (port: number): Promise<boolean> =>
   new Promise((resolve) => {
      const socket = createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
         socket.destroy();
         resolve(true);
      });
      socket.once('error', () => resolve(false));
   });

const isPortFree = (port: number): Promise<boolean> =>
   new Promise((resolve) => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
   });

const freePort = (): Promise<number> =>
   new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
         const address = server.address();
         const port = typeof address === 'object' && address ? address.port : 0;
         server.close(() => resolve(port));
      });
   });
