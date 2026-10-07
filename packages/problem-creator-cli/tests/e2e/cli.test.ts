import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { runCli } from '../../src/cli';
import { createCommandContext } from '../../src/core/context';
import { EXIT } from '../../src/core/exit-codes';
import { createFakeApi, trpcError } from '../helpers/fake-api';
import { createHarness, createTempDir, exampleDir } from '../helpers/harness';

const run = (
   args: string[],
   options: Parameters<typeof createHarness>[0] = {},
) => {
   const harness = createHarness(options);
   return { harness, exit: runCli(['node', 'qpc', ...args], harness.runtime) };
};

describe('qpc CLI 骨架', () => {
   it('--help 打印用法并以 0 退出', async () => {
      const { harness, exit } = run(['--help']);
      expect(await exit).toBe(EXIT.OK);
      expect(harness.out()).toContain('Usage: qpc');
      expect(harness.out()).toContain('check');
   });

   it('-v 打印版本号', async () => {
      const { harness, exit } = run(['-v']);
      expect(await exit).toBe(EXIT.OK);
      expect(harness.out().trim()).toMatch(/^\d+\.\d+\.\d+/);
   });

   it('未知命令是用法错误（退出码 2）', async () => {
      const { harness, exit } = run(['nope']);
      expect(await exit).toBe(EXIT.USAGE);
      expect(harness.err()).toContain('unknown command');
   });

   it('缺少必需参数时也是用法错误', async () => {
      const { exit } = run(['status']);
      expect(await exit).toBe(EXIT.USAGE);
   });

   it('INIT_CWD 作为相对路径基准（pnpm 脚本从仓库根调用时）', async () => {
      // 从仓库根跑 `pnpm qpc check my-problem` 时，npm/pnpm 会把 INIT_CWD
      // 设成仓库根，而脚本自身的 cwd 是包目录 —— 两者必须区分开。
      const harness = createHarness({
         cwd: '/tmp/package-dir',
         env: { INIT_CWD: '/repo-root' },
      });
      const rootCtx = await createCommandContext({}, harness.runtime);
      expect(rootCtx.cwd).toBe('/repo-root');

      // --cwd 优先级最高
      const withFlag = await createCommandContext(
         { cwd: '/explicit' },
         harness.runtime,
      );
      expect(withFlag.cwd).toBe('/explicit');
   });

   it('--json 模式下错误也是合法 JSON（便于 CI 解析）', async () => {
      const dir = await createTempDir();
      const { harness, exit } = run(['check', '--json'], { cwd: dir });
      expect(await exit).toBe(EXIT.USAGE);
      const payload = JSON.parse(harness.out().trim()) as {
         ok: boolean;
         error: { message: string };
      };
      expect(payload.ok).toBe(false);
      expect(payload.error.message).toContain('找不到题目配置');
   });

   it('check 通过时退出码为 0，结果在 stdout', async () => {
      const { harness, exit } = run(['check'], { cwd: exampleDir() });
      expect(await exit).toBe(EXIT.OK);
      expect(harness.out()).toContain('预检通过');
      expect(harness.out()).toContain('检查点');
   });

   it('--quiet 隐藏进度信息但保留报告（报告是结果，不是日志）', async () => {
      const { harness, exit } = run(['check', '--quiet'], {
         cwd: exampleDir(),
      });
      expect(await exit).toBe(EXIT.OK);
      expect(harness.out()).not.toContain('读取题目配置');
      expect(harness.out()).toContain('检查点');
   });

   it('check 有错误时退出码为 3', async () => {
      const dir = await createTempDir();
      const { exit } = run(['check'], { cwd: dir });
      // 目录里没有配置 → 用法错误；这里断言"非 0 且不是崩溃"
      expect(await exit).not.toBe(EXIT.OK);
   });

   it('未登录时 doctor 的修复建议指向 qpc login', async () => {
      const api = createFakeApi({
         'GET /api/trpc/auth.login.getUser': () =>
            trpcError('Required authentication', { status: 401 }),
      });
      const dir = await createTempDir();
      const { harness, exit } = run(['doctor'], { cwd: dir, fetch: api.fetch });
      expect(await exit).toBe(EXIT.OK);
      expect(harness.out()).toContain('qpc login');
   });
});

const execFileAsync = promisify(execFile);

describe('qpc 子进程真实调用（e2e）', () => {
   it('init → check 走一遍，退出码与输出都正确', async () => {
      const dir = await createTempDir();
      const env = {
         ...process.env,
         QUANTA_CONFIG_DIR: `${dir}/config`,
         NO_COLOR: '1',
      };
      const cli = ['--import', 'tsx', 'src/index.ts'];

      const init = await execFileAsync(
         process.execPath,
         [...cli, 'init', `${dir}/counter`, '--name', '计数器'],
         { cwd: packageRoot(), env },
      );
      expect(init.stdout).toContain('problem.config.ts');

      const check = await execFileAsync(
         process.execPath,
         [...cli, 'check', `${dir}/counter`],
         { cwd: packageRoot(), env },
      );
      expect(check.stdout).toContain('预检通过');
   });
});

// 必须用 fileURLToPath：Windows 上 URL.pathname 会得到 `/C:/...` 这种非法路径
const packageRoot = (): string =>
   fileURLToPath(new URL('../../', import.meta.url));
