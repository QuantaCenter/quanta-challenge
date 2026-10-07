import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { runCheck } from '../../src/commands/check';
import { runInit } from '../../src/commands/init';
import { PrecheckError, UsageError } from '../../src/core/errors';
import { loadProblemConfig } from '../../src/domain/problem-config';
import { validateProblem } from '../../src/domain/validate';
import { pathExists, writeText } from '../../src/utils/fs';
import {
   createTempDir,
   createTestContext,
   exampleDir,
} from '../helpers/harness';

const contextIn = async (cwd: string) => {
   const { ctx, harness } = await createTestContext({ cwd });
   return { ctx, harness };
};

describe('qpc init', () => {
   it('生成可在 check 中零错误通过的骨架', async () => {
      const dir = await createTempDir();
      const { ctx } = await contextIn(dir);

      await runInit(ctx, 'my-problem', {
         name: '我的题目',
         difficulty: 'medium',
      });

      const root = join(dir, 'my-problem');
      for (const file of [
         'problem.config.ts',
         'judge.js',
         'template/index.html',
         'answer/index.html',
         'README.md',
         '.gitignore',
      ]) {
         expect(await pathExists(join(root, file)), `${file} 应当存在`).toBe(
            true,
         );
      }

      // 生成物必须自己就是"正确写法"的示例：零错误、零警告
      // （只允许 CFG002 这条"未指定 totalScore，按检查点之和取值"的提示）
      const report = await validateProblem(await loadProblemConfig(root));
      expect(report.findings.map((finding) => finding.rule)).toEqual([
         'CFG002',
      ]);
      expect(report.ok).toBe(true);
      expect(report.totalScore).toBe(20);

      // 模板要留 TODO（学生起点），参考解要真的实现
      const template = await readFile(
         join(root, 'template/index.html'),
         'utf8',
      );
      const answer = await readFile(join(root, 'answer/index.html'), 'utf8');
      expect(template).toContain('TODO');
      expect(answer).not.toContain('TODO');
      expect(answer).toContain('已达标');
   });

   it('映射 --mount 到配置与启动命令', async () => {
      const dir = await createTempDir();
      const { ctx } = await contextIn(dir);

      await runInit(ctx, 'site', { mount: 'app' });

      const config = await readFile(
         join(dir, 'site/problem.config.ts'),
         'utf8',
      );
      expect(config).toContain("judgeUploadPath: 'app'");
      expect(config).toContain('npx serve -l 3000 app');
   });

   it('目录非空时拒绝，--force 才写入', async () => {
      const dir = await createTempDir();
      await writeText(join(dir, 'occupied/keep.txt'), 'x');
      const { ctx } = await contextIn(dir);

      await expect(runInit(ctx, 'occupied', {})).rejects.toBeInstanceOf(
         UsageError,
      );

      await runInit(ctx, 'occupied', { force: true });
      expect(await pathExists(join(dir, 'occupied/judge.js'))).toBe(true);
      // --force 只覆盖同名文件，不删别人的东西
      expect(await pathExists(join(dir, 'occupied/keep.txt'))).toBe(true);
   });

   it('难度与标签参数非法时给出用法错误', async () => {
      const dir = await createTempDir();
      const { ctx } = await contextIn(dir);
      await expect(
         runInit(ctx, 'a', { difficulty: 'nightmare' }),
      ).rejects.toThrow(/难度/);
      await expect(runInit(ctx, 'b', { tag: ['abc'] })).rejects.toThrow(/标签/);
   });
});

describe('qpc check', () => {
   it('示例题目通过并给出统计信息', async () => {
      const { ctx, harness } = await contextIn(exampleDir());
      const report = await runCheck(ctx, { dir: '.' });
      expect(report.ok).toBe(true);
      expect(harness.out()).toContain('预检通过');
      expect(harness.out()).toContain('3 个，合计 20 分');
   });

   it('有错误时抛 PrecheckError（退出码 3）', async () => {
      const dir = await createTempDir();
      const { ctx } = await contextIn(dir);
      await runInit(ctx, 'p', {});
      // 把"必须 return 分数"这条破坏掉
      await writeText(
         join(dir, 'p/judge.js'),
         (await readFile(join(dir, 'p/judge.js'), 'utf8')).replace(
            /return 5;/,
            'return;',
         ),
      );

      const error = (await runCheck(ctx, { dir: 'p' }).catch(
         (e: unknown) => e,
      )) as PrecheckError;
      expect(error).toBeInstanceOf(PrecheckError);
      expect(error.exitCode).toBe(3);
      expect(error.message).toContain('预检未通过');
   });

   it('--strict 让警告也失败', async () => {
      const dir = await createTempDir();
      const { ctx } = await contextIn(dir);
      await runInit(ctx, 'p', {});
      await writeText(
         join(dir, 'p/judge.js'),
         (await readFile(join(dir, 'p/judge.js'), 'utf8')).replace(
            "page.click('#inc', { timeout: 3000 })",
            "page.click('#inc')",
         ),
      );

      const soft = await runCheck(ctx, { dir: 'p' });
      expect(soft.warnings).toBeGreaterThan(0);
      await expect(runCheck(ctx, { dir: 'p', strict: true })).rejects.toThrow(
         /--strict/,
      );
   });

   it('缺少配置文件时是用法错误而不是崩溃', async () => {
      const dir = await createTempDir();
      const { ctx } = await contextIn(dir);
      await expect(runCheck(ctx, { dir: '.' })).rejects.toThrow(
         /找不到题目配置/,
      );
   });
});
