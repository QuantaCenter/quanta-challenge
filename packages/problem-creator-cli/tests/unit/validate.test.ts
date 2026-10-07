import { describe, expect, it } from 'vitest';

import { loadProblemConfig } from '../../src/domain/problem-config';
import { validateProblem } from '../../src/domain/validate';
import { writeText } from '../../src/utils/fs';
import { createTempDir, exampleDir } from '../helpers/harness';

const ruleIds = (report: { findings: Array<{ rule: string }> }): string[] =>
   report.findings.map((finding) => finding.rule);

describe('validateProblem', () => {
   it('随包提交的示例题目应当零错误', async () => {
      const config = await loadProblemConfig(exampleDir());
      const report = await validateProblem(config);
      expect(report.findings.filter((f) => f.severity === 'error')).toEqual([]);
      expect(report.ok).toBe(true);
      expect(report.totalScore).toBe(20);
      expect(report.stats.checkpointCount).toBe(3);
      expect(report.stats.template.fileCount).toBeGreaterThan(0);
      expect(report.stats.answer.fileCount).toBeGreaterThan(0);
      // 快照必须带上挂载路径前缀，否则 live-server 找不到站点根
      expect(Object.keys(report.templateSnapshot)).toContain(
         '/project/index.html',
      );
   });

   it('检查点没 return 分数 → JUD004（即使断言全过也会判 0 分）', async () => {
      const report = await validateFixture(`
         export default defineTestHandler(async ({ $ }) => {
            $.defineCheckPoint('忘了返回', 10, async () => {
               $.expect(true, '期望 a，实际为 b');
            });
         });
      `);
      expect(ruleIds(report)).toContain('JUD004');
      expect(report.ok).toBe(false);
   });

   it('缺少 export default → JUD002', async () => {
      const report = await validateFixture('const run = async () => {};');
      expect(ruleIds(report)).toContain('JUD002');
      expect(ruleIds(report)).toContain('JUD003');
   });

   it('totalScore 与检查点之和不一致 → CFG001', async () => {
      const report = await validateFixture(
         `
         export default defineTestHandler(async ({ $ }) => {
            $.defineCheckPoint('A', 10, async () => { $.expect(true, '期望 a，实际为 b'); return 10; });
         });
      `,
         'totalScore: 25,',
      );
      expect(ruleIds(report)).toContain('CFG001');
   });

   it('未指定 totalScore 时按检查点之和取值并提示（CFG002）', async () => {
      const report = await validateFixture(`
         export default defineTestHandler(async ({ $ }) => {
            $.defineCheckPoint('A', 7, async () => { $.expect(true, '期望 a，实际为 b'); return 7; });
         });
      `);
      expect(report.totalScore).toBe(7);
      expect(ruleIds(report)).toContain('CFG002');
   });

   it('click 无 timeout → JUD008，断言含糊 → JUD009', async () => {
      const report = await validateFixture(`
         export default defineTestHandler(async ({ page, $ }) => {
            $.defineCheckPoint('A', 1, async () => {
               await page.click('#x');
               $.expect(true, '错了');
               return 1;
            });
         });
      `);
      expect(ruleIds(report)).toContain('JUD008');
      expect(ruleIds(report)).toContain('JUD009');
      // 两者都不阻塞：JUD008 是警告，JUD009 只是提示
      expect(report.ok).toBe(true);
      expect(report.findings.find((f) => f.rule === 'JUD008')?.severity).toBe(
         'warn',
      );
      expect(report.findings.find((f) => f.rule === 'JUD009')?.severity).toBe(
         'info',
      );
   });

   it('initCommand 与 judgeUploadPath 不自洽 → RUN001', async () => {
      const report = await validateFixture(
         `
         export default defineTestHandler(async ({ $ }) => {
            $.defineCheckPoint('A', 1, async () => { $.expect(true, '期望 a，实际为 b'); return 1; });
         });
      `,
         "runtime: { judgeUploadPath: 'project', initCommand: 'npx serve -l 3000' },",
      );
      expect(ruleIds(report)).toContain('RUN001');
   });

   it('答案模板缺少 index.html → TPL003', async () => {
      const dir = await createTempDir();
      await writeText(`${dir}/problem.config.ts`, configSource());
      await writeText(`${dir}/judge.js`, goodJudge());
      await writeText(`${dir}/template/readme.md`, 'no index');
      await writeText(`${dir}/answer/index.html`, '<h1>answer</h1>');

      const report = await validateProblem(await loadProblemConfig(dir));
      expect(ruleIds(report)).toContain('TPL003');
   });

   it('快照体积超限 → SNAP001', async () => {
      const config = await loadProblemConfig(exampleDir());
      const report = await validateProblem(config, { maxUploadBytes: 10 });
      expect(ruleIds(report)).toContain('SNAP001');
      expect(report.ok).toBe(false);
   });
});

const goodJudge = (): string => `
export default defineTestHandler(async ({ $ }) => {
   $.defineCheckPoint('A', 1, async () => {
      $.expect(true, '期望 a，实际为 b');
      return 1;
   });
});
`;

const configSource = (
   extra = '',
): string => `import { defineProblemConfig } from '@challenge/problem-creator-cli';

export default defineProblemConfig({
   title: '预检测试',
   detail: '题面',
   difficulty: 'easy',
   tagIds: [1],
   ${extra}
});
`;

/** 构造一个只有 judge.js 有意义的临时题目并跑预检 */
const validateFixture = async (judge: string, extraConfig = '') => {
   const dir = await createTempDir();
   await writeText(`${dir}/problem.config.ts`, configSource(extraConfig));
   await writeText(`${dir}/judge.js`, judge);
   await writeText(`${dir}/template/index.html`, '<h1>template</h1>');
   await writeText(`${dir}/answer/index.html`, '<h1>answer</h1>');
   return validateProblem(await loadProblemConfig(dir));
};
