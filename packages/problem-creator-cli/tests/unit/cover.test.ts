import { describe, expect, it } from 'vitest';
import { UsageError } from '../../src/core/errors';
import {
   assertHexColor,
   buildCoverSvg,
   COVER_DEFAULTS,
   type CoverSpec,
   escapeXml,
   isHexColor,
   layoutCover,
   wrapByWidth,
} from '../../src/domain/cover';

const spec = (overrides: Partial<CoverSpec> = {}): CoverSpec => ({
   title: '购物车合计',
   bg: COVER_DEFAULTS.bg,
   accent: COVER_DEFAULTS.accent,
   text: COVER_DEFAULTS.text,
   width: COVER_DEFAULTS.width,
   height: COVER_DEFAULTS.height,
   ...overrides,
});

describe('封面配色校验', () => {
   it('只收十六进制颜色', () => {
      expect(isHexColor('#abc')).toBe(true);
      expect(isHexColor('#A6FB1D')).toBe(true);
      expect(isHexColor('#A6FB1DFF')).toBe(true);
      expect(isHexColor('red')).toBe(false);
      expect(isHexColor('#0F172A;fill:url(x)')).toBe(false);
   });

   it('非法颜色抛 UsageError 而不是把字符串拼进 SVG', () => {
      expect(() => assertHexColor('red', '背景色')).toThrow(UsageError);
      expect(() => buildCoverSvg(spec({ bg: 'red' }))).toThrow(UsageError);
      expect(() => buildCoverSvg(spec({ bgTo: 'url(#x)' }))).toThrow(
         UsageError,
      );
   });
});

describe('标题换行', () => {
   it('中文按字断行，英文优先断在空格', () => {
      const lines = wrapByWidth('图书库存查询与借阅 HTTP API', 6);
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
         expect(line.trim()).toBe(line);
         expect(line).not.toBe('');
      }
      // 空格处断行时不应把 "HTTP" 拆成 "HT" + "TP"
      expect(lines.join(' ')).not.toContain('HT TP');
   });

   it('单个超长英文单词硬切，而不是溢出', () => {
      const lines = wrapByWidth('supercalifragilisticexpialidocious', 4);
      expect(lines.length).toBeGreaterThan(1);
   });

   it('空标题退化成一行空串（不抛异常）', () => {
      expect(wrapByWidth('', 10)).toEqual(['']);
   });
});

describe('封面排版', () => {
   it('长标题收敛到不超过 3 行，且每行都不超宽', () => {
      const layout = layoutCover(
         spec({
            title: '超长的题目名称举例：图书库存查询、借阅与归还的完整 HTTP API 实现',
         }),
      );
      expect(layout.lines.length).toBeLessThanOrEqual(3);
      expect(layout.fontSize).toBeLessThanOrEqual(58);
      expect(layout.fontSize).toBeGreaterThan(20);
   });

   it('尺寸缩放：600 宽的字号是 1200 宽的一半', () => {
      const wide = layoutCover(spec());
      const narrow = layoutCover(spec({ width: 600, height: 338 }));
      expect(narrow.fontSize).toBeCloseTo(wide.fontSize / 2, 5);
   });

   it('竖条高度随标题行数增长', () => {
      const one = layoutCover(spec({ title: '购物车' }));
      const many = layoutCover(
         spec({
            title: '超长的题目名称举例：图书库存查询、借阅与归还的完整 HTTP API 实现',
         }),
      );
      expect(many.lines.length).toBeGreaterThan(one.lines.length);
      expect(many.barHeight).toBeGreaterThan(one.barHeight);
   });
});

describe('SVG 生成', () => {
   it('没给 bgTo 时是纯色，不出现渐变定义', () => {
      const svg = buildCoverSvg(spec());
      expect(svg).toContain(`fill="${COVER_DEFAULTS.bg}"`);
      expect(svg).not.toContain('linearGradient');
   });

   it('给了 bgTo 时画对角线渐变', () => {
      const svg = buildCoverSvg(spec({ bgTo: '#14432A' }));
      expect(svg).toContain('<linearGradient id="bg"');
      expect(svg).toContain('stop-color="#14432A"');
      expect(svg).toContain('fill="url(#bg)"');
   });

   it('标题与副标题都会做 XML 转义', () => {
      const svg = buildCoverSvg(
         spec({ title: 'a<b>&"c"', subtitle: "it's <ok>" }),
      );
      expect(svg).toContain('a&lt;b&gt;&amp;&quot;c&quot;');
      expect(svg).toContain('it&apos;s &lt;ok&gt;');
      expect(svg).not.toContain('<b>');
   });

   it('画布尺寸原样写进 svg 属性', () => {
      const svg = buildCoverSvg(spec({ width: 1600, height: 900 }));
      expect(svg).toContain('width="1600" height="900"');
      expect(svg).toContain('viewBox="0 0 1600 900"');
   });

   it('没给副标题就不渲染副标题文本', () => {
      const withSubtitle = buildCoverSvg(spec({ subtitle: 'GET /health' }));
      const without = buildCoverSvg(spec());
      expect(withSubtitle).toContain('GET /health');
      expect(without).not.toContain('GET /health');
      expect(without).toContain(COVER_DEFAULTS.footer);
   });
});

describe('escapeXml', () => {
   it('转义五个 XML 敏感字符', () => {
      expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
   });
});
