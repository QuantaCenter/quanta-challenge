import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { onTestFinished } from 'vitest';

import type { CommandContext, GlobalOptions } from '../../src/core/context';
import { createCommandContext } from '../../src/core/context';
import { type CliRuntime, createProcessRuntime } from '../../src/core/runtime';
import {
   type CookieJar,
   credentialsPath,
   writeCredentials,
} from '../../src/services/credentials';
import type { FetchLike } from '../../src/services/http';

export interface TestHarness {
   runtime: CliRuntime;
   stdout: string[];
   stderr: string[];
   out(): string;
   err(): string;
}

export interface HarnessOptions {
   cwd?: string;
   env?: Record<string, string>;
   fetch?: FetchLike;
   isTTY?: boolean;
}

/**
 * 测试用运行时：输出进数组、环境变量可注入、fetch 必须显式提供。
 *
 * fetch 默认抛错而不是走真实网络：任何忘了 mock 的命令都会立刻失败，
 * 而不是在 CI 里发出真实请求（出题接口是真会写库的）。
 */
export const createHarness = (options: HarnessOptions = {}): TestHarness => {
   const stdout: string[] = [];
   const stderr: string[] = [];
   const runtime = createProcessRuntime({
      cwd: options.cwd ?? process.cwd(),
      env: {
         QUANTA_CONFIG_DIR:
            options.env?.QUANTA_CONFIG_DIR ?? join(tmpdir(), 'qpc-test-config'),
         ...options.env,
      },
      stdin: process.stdin,
      stdout: (chunk) => void stdout.push(chunk),
      stderr: (chunk) => void stderr.push(chunk),
      isTTY: options.isTTY ?? false,
      fetch:
         options.fetch ??
         (() => {
            throw new Error('测试里必须显式提供 fetch（见 createFakeFetch）');
         }),
   });
   return {
      runtime,
      stdout,
      stderr,
      out: () => stdout.join(''),
      err: () => stderr.join(''),
   };
};

export const createTestContext = async (
   options: HarnessOptions & { globals?: GlobalOptions } = {},
): Promise<{ ctx: CommandContext; harness: TestHarness }> => {
   const harness = createHarness(options);
   const ctx = await createCommandContext(
      options.globals ?? {},
      harness.runtime,
   );
   return { ctx, harness };
};

/** 临时目录，测试结束自动清理（onTestFinished 由 vitest 提供） */
export const createTempDir = async (prefix = 'qpc-'): Promise<string> => {
   const dir = await mkdtemp(join(tmpdir(), prefix));
   onTestFinished(async () => {
      await rm(dir, { recursive: true, force: true });
   });
   return dir;
};

/** 仓库里随包提交的示例题目，用作端到端 fixture */
export const exampleDir = (name = 'hello-total'): string =>
   fileURLToPath(new URL(`../../examples/${name}/`, import.meta.url));

/** 预置一份已登录的凭据，避免每个命令测试都先跑一遍 login */
export const seedCredentials = async (
   configDir: string,
   cookies: CookieJar = {
      access: 'access-1',
      refresh: 'refresh-1',
      csrf: 'csrf-1',
   },
   user = {
      id: 'u1',
      nickname: 'admin',
      email: 'admin@example.com',
      role: 'ADMIN',
   },
): Promise<string> => {
   const file = credentialsPath(configDir);
   await writeCredentials(file, {
      version: 1,
      apiUrl: 'http://localhost:3000',
      cookies,
      user,
   });
   return file;
};
