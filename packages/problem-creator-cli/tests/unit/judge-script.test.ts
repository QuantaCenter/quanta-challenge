import { describe, expect, it } from 'vitest';

import {
   analyzeJudgeScript,
   maskNonCode,
   parseStringLiteral,
} from '../../src/domain/judge-script';

const SAMPLE = `export default defineTestHandler(async ({ page, $ }) => {
   $.defineCheckPoint('合计应为 10.50', 10, async () => {
      $.expect(true, '期望 10.50，实际为 "' + actual + '"');
      return 10;
   });
});`;

describe('maskNonCode', () => {
   it('把注释、字符串、模板串与正则替换成等长空格并保留换行', () => {
      const code = [
         "const a = 'defineCheckPoint('; // defineCheckPoint(",
         'const re = /\\)/;',
         'const t = `x ${ y } z`;',
      ].join('\n');
      const masked = maskNonCode(code);
      expect(masked).toHaveLength(code.length);
      expect(masked.split('\n')).toHaveLength(3);
      expect(masked).not.toContain('defineCheckPoint');
      // 正则整体被抹掉，括号不会干扰后续配对
      expect(masked).not.toContain(')');
   });

   it('保留真实代码里的括号与标识符', () => {
      const masked = maskNonCode('f(1, "x")');
      expect(masked).toBe('f(1,    )');
   });
});

describe('parseStringLiteral', () => {
   it('解析单引号/双引号与转义', () => {
      expect(parseStringLiteral("'a\\nb'")).toBe('a\nb');
      expect(parseStringLiteral('"x"')).toBe('x');
   });

   it('模板串含插值时视为非字面量', () => {
      expect(parseStringLiteral('`a ${b}`')).toBeUndefined();
      expect(parseStringLiteral('`a`')).toBe('a');
   });

   it('非字面量返回 undefined', () => {
      expect(parseStringLiteral('someVar')).toBeUndefined();
   });
});

describe('analyzeJudgeScript', () => {
   it('识别检查点、名称、分值与 return 情况', () => {
      const analysis = analyzeJudgeScript(SAMPLE);
      expect(analysis.hasDefaultExport).toBe(true);
      expect(analysis.hasDefineTestHandler).toBe(true);
      expect(analysis.checkpoints).toHaveLength(1);
      expect(analysis.checkpoints[0]).toMatchObject({
         name: '合计应为 10.50',
         score: 10,
         returnsValue: true,
      });
      expect(analysis.checkpointTotal).toBe(10);
      expect(analysis.expectationCount).toBe(1);
   });

   it('发现没有 return 分数的 handler（最高频的坑）', () => {
      const analysis = analyzeJudgeScript(`
         export default defineTestHandler(async ({ $ }) => {
            $.defineCheckPoint('断言全过但没返回', 10, async () => {
               $.expect(true, '期望 x，实际为 y');
            });
         });
      `);
      expect(analysis.checkpoints[0]?.returnsValue).toBe(false);
   });

   it('return 后面没有值也算未返回分数', () => {
      const analysis = analyzeJudgeScript(`
         export default defineTestHandler(async ({ $ }) => {
            $.defineCheckPoint('空 return', 5, async () => {
               return;
            });
         });
      `);
      expect(analysis.checkpoints[0]?.returnsValue).toBe(false);
   });

   it('注释与字符串里的 defineCheckPoint 不会被算进去', () => {
      const analysis = analyzeJudgeScript(`
         // $.defineCheckPoint('注释里的', 99, async () => { return 99; });
         const hint = "$.defineCheckPoint('字符串里的', 99, async () => { return 99; })";
         export default defineTestHandler(async () => {});
      `);
      expect(analysis.checkpoints).toHaveLength(0);
      expect(analysis.checkpointTotal).toBe(0);
   });

   it('记录非字面量分值与重复检查点名', () => {
      const analysis = analyzeJudgeScript(`
         export default defineTestHandler(async ({ $ }) => {
            $.defineCheckPoint('A', SCORE, async () => { return SCORE; });
            $.defineCheckPoint('A', 1, async () => { return 1; });
         });
      `);
      expect(analysis.unparsedCheckpoints).toHaveLength(1);
      expect(analysis.unparsedCheckpoints[0]?.value).toBe('SCORE');
      expect(analysis.checkpoints.map((cp) => cp.name)).toEqual(['A', 'A']);
   });

   it('识别未设置 timeout 的 click 与已设置 timeout 的 click', () => {
      const analysis = analyzeJudgeScript(`
         export default defineTestHandler(async ({ page }) => {
            await page.click('#a');
            await page.click('#b', { timeout: 3000 });
            await page.$eval('#c', (el) => el.dispatchEvent(new MouseEvent('click')));
         });
      `);
      expect(analysis.clickWithoutTimeout).toHaveLength(1);
      expect(analysis.clickWithoutTimeout[0]?.value).toContain(
         "page.click('#a')",
      );
   });

   it('识别缺少"期望 vs 实际"的断言消息', () => {
      const analysis = analyzeJudgeScript(`
         export default defineTestHandler(async ({ $ }) => {
            $.expect(a === b, '合计错误');
            $.expect(c === d, '期望 1，实际为 2');
            $.expect(e === f, 'expect 1, received 2');
         });
      `);
      expect(analysis.vagueExpectations).toHaveLength(1);
      expect(analysis.vagueExpectations[0]?.value).toBe('合计错误');
   });

   it('缺少 default export 与 defineTestHandler 时如实报告', () => {
      const analysis = analyzeJudgeScript('const run = async () => {};');
      expect(analysis.hasDefaultExport).toBe(false);
      expect(analysis.hasDefineTestHandler).toBe(false);
   });

   it('收集 default 之外的导出', () => {
      const analysis = analyzeJudgeScript(`
         export const helper = 1;
         export default defineTestHandler(async () => {});
      `);
      expect(analysis.namedExports).toEqual(['helper']);
   });
});
