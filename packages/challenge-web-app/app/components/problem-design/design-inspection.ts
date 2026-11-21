import type { ProblemDesignNode } from '@challenge/judge-machine-agent/schemas';
import { round } from '@quantacenter/page2design';

export interface InspectionValue {
   label: string;
   value: string;
   copyValue?: string;
   color?: string;
   gradient?: string;
   copyable?: false;
}

export type DesignUnit = 'px' | 'rem';
type LengthFormatter = (pixels: number) => string;

const corners = ['左上', '右上', '右下', '左下'];
const sides = { top: '上', right: '右', bottom: '下', left: '左' } as const;
const borderStyles: Record<string, string> = { solid: '实线', dashed: '虚线', dotted: '点线', double: '双线' };
const alignments: Record<string, string> = {
   left: '左对齐', right: '右对齐', center: '居中', justify: '两端对齐', start: '起始端', end: '结束端',
};
const gradientTypes: Record<string, string> = { linear: '线性渐变', radial: '径向渐变', conic: '角度渐变' };

export const pixelValue = (number: number) => round(number) + ' px';
export const isNumericValue = (value: string) => /\d/.test(value) && /^(?:[-\d.\s×/%°]|px|rem)+$/.test(value);

export function createLengthFormatter(unit: DesignUnit, rootFontSize: number): LengthFormatter {
   if (unit === 'px') return pixelValue;
   const base = Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : 16;
   return pixels => round(pixels / base, 4) + ' rem';
}

function dimension(value: string, formatLength: LengthFormatter) {
   return value.replace(/(-?[\d.]+)px\b/g, (_, pixels: string) =>
      formatLength === pixelValue ? pixels + ' px' : formatLength(Number(pixels)),
   );
}

function addValue(rows: InspectionValue[], label: string, value?: string) {
   if (value) rows.push({ label, value });
}

function addColor(rows: InspectionValue[], label: string, color?: string) {
   if (!color || color === 'transparent') return;
   const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
   if (!rgb) {
      rows.push({ label, value: color, color });
      return;
   }
   const alpha = Number(rgb[4] ?? 1);
   if (!alpha) return;
   const hex = '#' + rgb.slice(1, 4).map(channel => Number(channel).toString(16).padStart(2, '0')).join('').toUpperCase();
   rows.push({
      label,
      value: alpha === 1 ? hex : hex + ' · ' + round(alpha * 100) + '%',
      copyValue: alpha === 1 ? hex : color,
      color,
   });
}

export function inspectAppearance(node: ProblemDesignNode, formatLength = pixelValue) {
   const rows: InspectionValue[] = [];
   const { style } = node;
   if (node.kind !== 'text') {
      addColor(rows, '背景色', style['background-color']);
      const backgrounds = node.backgroundLayers ?? [];
      for (const [index, layer] of backgrounds.entries()) {
         const match = layer.image.match(/^(repeating-)?(linear|radial|conic)-gradient\(/);
         const label = backgrounds.length > 1 ? '背景填充 ' + (index + 1) : '背景填充';
         if (match && !/\b(?:url|image|image-set)\s*\(/i.test(layer.image)) {
            rows.push({ label, value: (match[1] ? '重复' : '') + gradientTypes[match[2]!], gradient: layer.image, copyable: false });
            const angle = layer.image.match(/-gradient\((-?[\d.]+)deg,/);
            if (angle) addValue(rows, '渐变角度', angle[1] + '°');
            const colors = layer.image.match(/\b(?:rgba?|hsla?|color|oklch|oklab|lch|lab)\([^()]+\)|#[\da-f]{3,8}\b/gi) ?? [];
            colors.forEach((color, colorIndex) => addColor(rows, '渐变色 ' + (colorIndex + 1), color));
         } else if (layer.url || layer.assetId) {
            rows.push({ label, value: '图像', copyable: false });
         }
      }

      const radius = style['border-radius'];
      if (radius && /[%/]/.test(radius)) {
         addValue(rows, '圆角', dimension(radius, formatLength));
      } else if (node.radius.some(Boolean) || node.radiusY?.some(Boolean)) {
         const values = node.radius.map((x, index) => {
            const y = node.radiusY?.[index] ?? x;
            return x === y ? formatLength(x) : formatLength(x).split(' ')[0] + ' × ' + formatLength(y);
         });
         if (values.every(value => value === values[0])) addValue(rows, '圆角', values[0]);
         else values.forEach((value, index) => addValue(rows, '圆角 · ' + corners[index], value));
      }

      const borders = (Object.keys(sides) as (keyof typeof sides)[]).map(side => ({
         side,
         width: node.border[side],
         color: style['border-' + side + '-color'],
         line: style['border-' + side + '-style'],
      }));
      const firstBorder = borders[0]!;
      const uniform = borders.every(border => border.width === firstBorder.width && border.color === firstBorder.color && border.line === firstBorder.line);
      for (const { side, width, color, line } of uniform ? [firstBorder] : borders) {
         if (!width || line === 'none' || line === 'hidden') continue;
         const label = uniform ? '边框' : sides[side] + '边框';
         addValue(rows, label + '宽度', formatLength(width));
         addColor(rows, label + '颜色', color);
         addValue(rows, label + '样式', line && (borderStyles[line] ?? line));
      }
   }

   const opacity = node.opacityGroups?.find(group => group.id === node.id)?.opacity;
   if (opacity !== undefined && opacity !== 1) addValue(rows, '不透明度', round(opacity * 100) + '%');
   return rows;
}

export function inspectTypography(node: ProblemDesignNode, formatLength = pixelValue) {
   const rows: InspectionValue[] = [];
   if (node.canvasBackground || !['text', 'control', 'frame'].includes(node.kind)) return rows;
   const { style } = node;
   const run = node.runs?.[0] ?? node.control?.textRuns?.[0];
   const fill = node.inspection?.textFillColor || style['-webkit-text-fill-color'];
   addValue(rows, '字体', run?.fontFamily || style['font-family']);
   addValue(rows, '字号', run ? formatLength(run.fontSize) : dimension(style['font-size'] ?? '', formatLength));
   addValue(rows, '字重', run?.fontWeight || style['font-weight']);
   const fontStyle = run?.fontStyle || style['font-style'];
   if (fontStyle && fontStyle !== 'normal') addValue(rows, '字形', fontStyle === 'italic' ? '斜体' : fontStyle);
   const lineHeight = style['line-height'];
   addValue(rows, '行高', lineHeight === 'normal' ? '自动' : dimension(lineHeight ?? '', formatLength));
   const letterSpacing = style['letter-spacing'];
   addValue(rows, '字距', run ? formatLength(run.letterSpacing) : letterSpacing === 'normal' ? '自动' : dimension(letterSpacing ?? '', formatLength));
   const align = node.inspection?.textAlign ?? (node.positioning !== 'absolute' ? style['text-align'] : undefined);
   if (align && alignments[align]) addValue(rows, '对齐', alignments[align]);
   addColor(rows, '文字颜色', (fill !== style.color ? fill : undefined) || run?.color || style.color);
   return rows;
}

export function inspectShadows(node: ProblemDesignNode, formatLength = pixelValue) {
   const rows: InspectionValue[] = [];
   const text = node.kind === 'text';
   const shadows = (text ? node.runs?.[0]?.textShadow ?? node.style['text-shadow'] : node.style['box-shadow']) ?? '';
   const parts = shadows.split(/,(?![^()]*\))/);
   for (const [index, shadow] of parts.entries()) {
      const color = shadow.match(/\b(?:rgba?|hsla?|color|oklch|oklab|lch|lab)\([^()]+\)/i)?.[0];
      const values = shadow.replace(color ?? '', '').match(/-?[\d.]+px/g) ?? [];
      if (values.length < 2) continue;
      const label = shadow.includes('inset') ? '内阴影' : text ? '文字阴影' : '投影';
      const name = parts.length === 1 ? label : label + ' ' + (index + 1);
      addValue(rows, name + ' X 偏移', dimension(values[0]!, formatLength));
      addValue(rows, name + ' Y 偏移', dimension(values[1]!, formatLength));
      addValue(rows, name + '模糊', dimension(values[2] ?? '0px', formatLength));
      if (!text) addValue(rows, name + '扩展', dimension(values[3] ?? '0px', formatLength));
      addColor(rows, name + '颜色', color);
   }
   return rows;
}

export function inspectSpacing({ style }: ProblemDesignNode, formatLength = pixelValue) {
   const rows: InspectionValue[] = [];
   if (!/\b(flex|grid)\b/.test(style.display ?? '')) return rows;
   const row = style['row-gap'];
   const column = style['column-gap'];
   if (row && row !== 'normal') addValue(rows, row === column ? '间距' : '行间距', dimension(row, formatLength));
   if (column && column !== 'normal' && column !== row) addValue(rows, '列间距', dimension(column, formatLength));
   return rows;
}
