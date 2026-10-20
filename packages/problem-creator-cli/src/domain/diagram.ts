import { escapeXml, fontStack, textWidthEm } from './cover';

export type FlowDirection = 'lr' | 'tb';
export type DiagramTheme = 'light' | 'dark';

export interface FlowSpec {
   steps: string[];
   title?: string;
   direction: FlowDirection;
   theme: DiagramTheme;
}

const THEMES: Record<
   DiagramTheme,
   { bg: string; box: string; border: string; text: string; accent: string }
> = {
   light: {
      bg: '#FFFFFF',
      box: '#F8FAFC',
      border: '#CBD5E1',
      text: '#0F172A',
      accent: '#6366F1',
   },
   dark: {
      bg: '#0F172A',
      box: '#1E293B',
      border: '#334155',
      text: '#E2E8F0',
      accent: '#818CF8',
   },
};

const FONT_SIZE = 20;
const LINE_HEIGHT = 28;
const PAD_X = 24;
const PAD_Y = 18;
const GAP = 72;
const MARGIN = 40;
const TITLE_SIZE = 24;
const MIN_BOX_WIDTH = 140;

/** 每个步骤里的 `\n`（字面量或真实换行）都视为换行 */
export const splitLabel = (label: string): string[] =>
   label
      .split(/\\n|\n/)
      .map((line) => line.trim())
      .filter(Boolean);

/** 流程示意图（方框 + 箭头）：给题面画"请求链路 / 操作步骤 / 状态流转"，直接出 SVG。 */
export const buildFlowSvg = (spec: FlowSpec): string => {
   const theme = THEMES[spec.theme];
   const boxes = spec.steps.map((step) => {
      const lines = splitLabel(step);
      const textWidth = Math.max(
         ...lines.map((line) => textWidthEm(line, false) * FONT_SIZE),
      );
      return {
         lines,
         width: Math.max(MIN_BOX_WIDTH, Math.ceil(textWidth + PAD_X * 2)),
         height: lines.length * LINE_HEIGHT + PAD_Y * 2,
      };
   });

   const horizontal = spec.direction === 'lr';
   const titleHeight = spec.title ? TITLE_SIZE + 24 : 0;
   const maxWidth = Math.max(...boxes.map((box) => box.width));
   const maxHeight = Math.max(...boxes.map((box) => box.height));
   const contentWidth = horizontal
      ? boxes.reduce((sum, box) => sum + box.width, 0) +
        GAP * (boxes.length - 1)
      : maxWidth;
   const contentHeight = horizontal
      ? maxHeight
      : boxes.reduce((sum, box) => sum + box.height, 0) +
        GAP * (boxes.length - 1);
   const titleWidth = spec.title
      ? textWidthEm(spec.title, true) * TITLE_SIZE
      : 0;
   const width = Math.ceil(Math.max(contentWidth, titleWidth) + MARGIN * 2);
   const height = Math.ceil(contentHeight + titleHeight + MARGIN * 2);
   const originX = (width - contentWidth) / 2;
   const originY = MARGIN + titleHeight;

   const parts: string[] = [
      `<rect width="${width}" height="${height}" fill="${theme.bg}"/>`,
      `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${theme.accent}"/></marker></defs>`,
   ];
   if (spec.title) {
      parts.push(
         `<text x="${width / 2}" y="${MARGIN + TITLE_SIZE}" text-anchor="middle" font-family="${fontStack(false)}" font-size="${TITLE_SIZE}" font-weight="700" fill="${theme.text}">${escapeXml(spec.title)}</text>`,
      );
   }

   let cursor = 0;
   boxes.forEach((box, index) => {
      const x = horizontal
         ? originX + cursor
         : originX + (maxWidth - box.width) / 2;
      const y = horizontal
         ? originY + (maxHeight - box.height) / 2
         : originY + cursor;
      parts.push(
         `<rect x="${x}" y="${y}" width="${box.width}" height="${box.height}" rx="12" fill="${theme.box}" stroke="${index === 0 ? theme.accent : theme.border}" stroke-width="2"/>`,
      );
      box.lines.forEach((line, lineIndex) => {
         parts.push(
            `<text x="${x + box.width / 2}" y="${y + PAD_Y + LINE_HEIGHT * lineIndex + FONT_SIZE}" text-anchor="middle" font-family="${fontStack(false)}" font-size="${FONT_SIZE}" fill="${theme.text}">${escapeXml(line)}</text>`,
         );
      });
      if (index < boxes.length - 1) {
         const line = horizontal
            ? {
                 x1: x + box.width + 6,
                 y1: originY + maxHeight / 2,
                 x2: x + box.width + GAP - 6,
                 y2: originY + maxHeight / 2,
              }
            : {
                 x1: originX + maxWidth / 2,
                 y1: y + box.height + 6,
                 x2: originX + maxWidth / 2,
                 y2: y + box.height + GAP - 6,
              };
         parts.push(
            `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${theme.accent}" stroke-width="2.5" marker-end="url(#arrow)"/>`,
         );
      }
      cursor += (horizontal ? box.width : box.height) + GAP;
   });

   return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
};
