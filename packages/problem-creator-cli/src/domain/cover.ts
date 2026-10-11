import { UsageError } from '../core/errors';

export interface CoverSpec {
   /** 主标题（必填）。过长会自动换行并缩小字号 */
   title: string;
   /** 强调色副标题，例如接口清单或一句话简介 */
   subtitle?: string;
   /** 左下角页脚，默认 "Quanta Challenge" */
   footer?: string;
   /** 背景色（`#rgb` / `#rrggbb`） */
   bg: string;
   /** 渐变终止色；给了就画对角线渐变，否则纯色 */
   bgTo?: string;
   /** 强调色：竖条 + 副标题 */
   accent: string;
   /** 主标题颜色 */
   text: string;
   /** 画布宽高（像素） */
   width: number;
   height: number;
}

export const COVER_DEFAULTS = {
   bg: '#0F172A',
   accent: '#A6FB1D',
   text: '#F8FAFC',
   footer: 'Quanta Challenge',
   width: 1200,
   height: 675,
} as const;

/** 手写那版封面的渐变终止色，作为 `--bg-to` 的推荐值写进文档 */
export const COVER_SUGGESTED_BG_TO = '#14432A';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const isHexColor = (value: string): boolean => HEX_COLOR.test(value);

/**
 * 颜色只收十六进制。
 *
 * 不是洁癖：这些值会被拼进 SVG 属性。放任 `red;...` 这类字符串进来，
 * 就等于把「配色参数」变成注入点。名字色（`red`）不值得为它开这个口子。
 */
export const assertHexColor = (value: string, field: string): string => {
   if (!isHexColor(value)) {
      throw new UsageError(
         `${field} 必须是十六进制颜色（#rgb / #rrggbb），当前为 "${value}"`,
         { hint: '例如 --bg "#0F172A" --accent "#A6FB1D"。' },
      );
   }
   return value;
};

const XML_ESCAPES: Record<string, string> = {
   '&': '&amp;',
   '<': '&lt;',
   '>': '&gt;',
   '"': '&quot;',
   "'": '&apos;',
};

export const escapeXml = (value: string): string =>
   value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char] ?? char);

/** 全角/宽字符判定（与 logger 的显示宽度判定同源，用于估算排版宽度） */
const isWideChar = (code: number): boolean =>
   (code >= 0x1100 && code <= 0x115f) ||
   (code >= 0x2e80 && code <= 0xa4cf) ||
   (code >= 0xac00 && code <= 0xd7a3) ||
   (code >= 0xf900 && code <= 0xfaff) ||
   (code >= 0xfe30 && code <= 0xfe6f) ||
   (code >= 0xff00 && code <= 0xff60) ||
   (code >= 0xffe0 && code <= 0xffe6);

/** 单字符宽度，单位是 em（相对当前字号） */
const charWidthEm = (char: string, bold: boolean): number => {
   const code = char.codePointAt(0) ?? 0;
   if (isWideChar(code)) return 1;
   if (char === ' ') return 0.28;
   if ("ilj.,:;'|!".includes(char)) return 0.3;
   if (/[A-Z]/.test(char)) return bold ? 0.68 : 0.66;
   if (/[0-9]/.test(char)) return 0.58;
   return bold ? 0.6 : 0.56;
};

const textWidthEm = (text: string, bold: boolean): number =>
   [...text].reduce((sum, char) => sum + charWidthEm(char, bold), 0);

/** 可以在其后断行的位置：空格之后，或任意宽字符之后（中文没有空格） */
const isBreakAfter = (char: string): boolean =>
   char === ' ' || isWideChar(char.codePointAt(0) ?? 0);

/**
 * 按最大宽度（em）贪心换行。
 *
 * 优先在最近的断点断（空格 / 汉字边界），只有在行首没有断点时才硬切，
 * 这样 "图书库存查询与借阅 HTTP API" 会断成两行而不是把单词拆开。
 */
export const wrapByWidth = (
   text: string,
   maxWidthEm: number,
   bold = true,
): string[] => {
   const lines: string[] = [];
   let current = '';
   let currentEm = 0;
   let breakAt = -1;
   let breakEm = 0;

   const flush = (at: number, em: number) => {
      const line = (at >= 0 ? current.slice(0, at) : current).trim();
      if (line) lines.push(line);
      current = at >= 0 ? current.slice(at).trimStart() : '';
      currentEm = at >= 0 ? currentEm - em : 0;
      breakAt = -1;
      breakEm = 0;
   };

   for (const char of text) {
      const width = charWidthEm(char, bold);
      if (currentEm + width > maxWidthEm && current) {
         // 只有断点足够靠后（>40% 行宽）才用它，否则宁可硬切，避免出现极短的尾行
         if (breakAt > 0 && breakEm > maxWidthEm * 0.4) {
            flush(breakAt, breakEm);
         } else {
            flush(-1, currentEm);
         }
      }
      current += char;
      currentEm += width;
      if (isBreakAfter(char)) {
         breakAt = current.length;
         breakEm = currentEm;
      }
   }
   if (current.trim()) lines.push(current.trim());
   return lines.length > 0 ? lines : [''];
};

export interface CoverLayout {
   lines: string[];
   fontSize: number;
   lineHeight: number;
   barX: number;
   barY: number;
   barWidth: number;
   barHeight: number;
   textX: number;
   firstBaseline: number;
   subtitleBaseline: number;
   subtitleFontSize: number;
   footerBaseline: number;
   footerFontSize: number;
}

/**
 * 字号从基准值往下收敛，直到能塞进 maxLines 行且每行都不超宽。
 *
 * 收敛的下限是 0.5 × 基准：再小就不可读了，宁可让标题多占一行。
 */
export const layoutCover = (spec: CoverSpec): CoverLayout => {
   const scale = spec.width / COVER_DEFAULTS.width;
   const pad = 72 * scale;
   const barWidth = 6 * scale;
   const textX = pad + barWidth + 26 * scale;
   const contentWidth = spec.width - textX - pad;
   const baseFontSize = 58 * scale;
   const minFontSize = Math.max(20, baseFontSize * 0.5);
   const maxLines = 3;

   let fontSize = baseFontSize;
   let lines = wrapByWidth(spec.title, contentWidth / fontSize, true);
   for (let size = baseFontSize; size >= minFontSize; size -= 2) {
      const candidate = wrapByWidth(spec.title, contentWidth / size, true);
      const fits = candidate.every(
         (line) => textWidthEm(line, true) * size <= contentWidth + 0.5,
      );
      if (fits && candidate.length <= maxLines) {
         fontSize = size;
         lines = candidate;
         break;
      }
      fontSize = size;
      lines = candidate;
   }

   const lineHeight = fontSize * 1.22;
   const blockTop = pad + 24 * scale;
   const textBaseline = blockTop + fontSize;
   const barHeight = lineHeight * (lines.length - 1) + fontSize * 1.02;
   const subtitleFontSize = 26 * scale;
   const subtitleBaseline =
      blockTop + lineHeight * (lines.length - 1) + fontSize * 0.62 + 72 * scale;

   return {
      lines,
      fontSize,
      lineHeight,
      barX: pad,
      barY: blockTop + fontSize * 0.06,
      barWidth,
      barHeight,
      textX,
      firstBaseline: textBaseline,
      subtitleBaseline,
      subtitleFontSize,
      footerBaseline: spec.height - 60 * scale,
      footerFontSize: 24 * scale,
   };
};

const fontStack = (mono: boolean): string =>
   mono
      ? "'Menlo','Monaco','Courier New',monospace"
      : "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Source Han Sans SC',sans-serif";

export const buildCoverSvg = (spec: CoverSpec): string => {
   assertHexColor(spec.bg, '背景色');
   assertHexColor(spec.accent, '强调色');
   assertHexColor(spec.text, '标题颜色');
   if (spec.bgTo !== undefined) assertHexColor(spec.bgTo, '渐变终止色');

   const layout = layoutCover(spec);
   const background =
      spec.bgTo === undefined
         ? `<rect width="${spec.width}" height="${spec.height}" fill="${spec.bg}"/>`
         : `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
           `<stop offset="0%" stop-color="${spec.bg}"/>` +
           `<stop offset="100%" stop-color="${spec.bgTo}"/></linearGradient></defs>` +
           `<rect width="${spec.width}" height="${spec.height}" fill="url(#bg)"/>`;

   const titleLines = layout.lines
      .map(
         (line, index) =>
            `<text x="${layout.textX}" y="${round(layout.firstBaseline + index * layout.lineHeight)}" ` +
            `font-family="${fontStack(false)}" font-size="${round(layout.fontSize)}" ` +
            `font-weight="700" fill="${spec.text}">${escapeXml(line)}</text>`,
      )
      .join('\n');

   const subtitle = spec.subtitle
      ? `<text x="${layout.textX}" y="${round(layout.subtitleBaseline)}" ` +
        `font-family="${fontStack(true)}" font-size="${round(layout.subtitleFontSize)}" ` +
        `font-weight="700" fill="${spec.accent}">${escapeXml(spec.subtitle)}</text>`
      : '';

   const footer =
      `<text x="${layout.barX}" y="${round(layout.footerBaseline)}" ` +
      `font-family="${fontStack(false)}" font-size="${round(layout.footerFontSize)}" ` +
      `fill="#64748B">${escapeXml(spec.footer ?? COVER_DEFAULTS.footer)}</text>`;

   return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">`,
      background,
      `<rect x="${layout.barX}" y="${round(layout.barY)}" width="${layout.barWidth}" height="${round(layout.barHeight)}" rx="${layout.barWidth / 2}" fill="${spec.accent}"/>`,
      titleLines,
      subtitle,
      footer,
      '</svg>',
   ]
      .filter(Boolean)
      .join('\n');
};

const round = (value: number): number => Math.round(value * 100) / 100;
