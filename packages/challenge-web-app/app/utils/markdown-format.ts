/**
 * Markdown 编辑工具栏的纯文本变换。
 *
 * 所有函数只做「文本 + 选区偏移 -> 一次替换」的计算，不碰 Monaco / DOM，
 * 这样可以脱离浏览器直接单测；编辑器侧只负责把结果应用到 model 上。
 */

/** 工具栏动作 id */
export type MarkdownToolbarAction =
   | 'undo'
   | 'redo'
   | 'h1'
   | 'h2'
   | 'h3'
   | 'bold'
   | 'italic'
   | 'strike'
   | 'inlineCode'
   | 'quote'
   | 'ul'
   | 'ol'
   | 'task'
   | 'link'
   | 'image'
   | 'table'
   | 'codeBlock'
   | 'hr';

/** 一次替换：用 insert 替换 [from, to)，并选中替换后文档里的 [selectFrom, selectTo) */
export interface MarkdownEdit {
   from: number;
   to: number;
   insert: string;
   selectFrom: number;
   selectTo: number;
}

export type MarkdownLineKind = 'h1' | 'h2' | 'h3' | 'quote' | 'ul' | 'ol' | 'task';

/**
 * 行内标记（加粗 / 斜体 / 删除线 / 行内代码）：已包裹则取消，否则包裹。
 * 无选区时插入「标记 + 占位文字 + 标记」并选中占位文字，方便直接输入覆盖。
 */
export const toggleInlineWrap = (
   text: string,
   start: number,
   end: number,
   marker: string,
   placeholder: string
): MarkdownEdit => {
   // 选区两端的空白不应被包进标记里（`** x **` 不会被渲染为粗体）
   let s = start;
   let e = end;
   while (s < e && /\s/.test(text[s] ?? '')) s++;
   while (e > s && /\s/.test(text[e - 1] ?? '')) e--;

   const m = marker.length;
   const selected = text.slice(s, e);
   // 单个 `*` 要避开 `**`，否则对粗体文字点斜体会被误判成「已是斜体」
   const clash = (char: string | undefined) => marker === '*' && char === '*';

   const wrappedOutside =
      s - m >= 0 &&
      text.slice(s - m, s) === marker &&
      text.slice(e, e + m) === marker &&
      !clash(text[s - m - 1]) &&
      !clash(text[e + m]);
   if (wrappedOutside) {
      return {
         from: s - m,
         to: e + m,
         insert: selected,
         selectFrom: s - m,
         selectTo: s - m + selected.length,
      };
   }

   const wrappedInside =
      selected.length >= m * 2 &&
      selected.startsWith(marker) &&
      selected.endsWith(marker) &&
      !clash(selected[m]) &&
      !clash(selected[selected.length - m - 1]);
   if (wrappedInside) {
      const inner = selected.slice(m, selected.length - m);
      return {
         from: s,
         to: e,
         insert: inner,
         selectFrom: s,
         selectTo: s + inner.length,
      };
   }

   const body = selected || placeholder;
   return {
      from: s,
      to: e,
      insert: `${marker}${body}${marker}`,
      selectFrom: s + m,
      selectTo: s + m + body.length,
   };
};

const LIST_MARKER_RE = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/;
const QUOTE_RE = /^(\s*)>\s?/;
const HEADING_RE = /^\s{0,3}#{1,6}\s+/;

const HEADING_LEVEL: Record<string, number> = { h1: 1, h2: 2, h3: 3 };

const hasPrefix = (line: string, kind: MarkdownLineKind) => {
   switch (kind) {
      case 'h1':
      case 'h2':
      case 'h3': {
         const hashes = /^\s{0,3}(#{1,6})\s/.exec(line)?.[1];
         return hashes?.length === HEADING_LEVEL[kind];
      }
      case 'quote':
         return QUOTE_RE.test(line);
      case 'ul':
         return /^\s*[-*+]\s+(?!\[[ xX]\]\s)/.test(line);
      case 'ol':
         return /^\s*\d+[.)]\s/.test(line);
      case 'task':
         return /^\s*[-*+]\s+\[[ xX]\]\s/.test(line);
   }
};

const removePrefix = (line: string, kind: MarkdownLineKind) => {
   switch (kind) {
      case 'h1':
      case 'h2':
      case 'h3':
         return line.replace(HEADING_RE, '');
      case 'quote':
         return line.replace(QUOTE_RE, '$1');
      default:
         return line.replace(LIST_MARKER_RE, '$1');
   }
};

/**
 * 行首前缀（标题 / 引用 / 列表 / 任务）：作用于选区覆盖的所有行。
 * 所有行都已带该前缀时取消；否则统一设置（会先替换掉同类的旧前缀，
 * 例如无序列表 <-> 有序列表 <-> 任务列表、h1 <-> h2 之间直接切换）。
 */
export const toggleLinePrefix = (
   text: string,
   start: number,
   end: number,
   kind: MarkdownLineKind
): MarkdownEdit => {
   const lineStart = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
   // 选区恰好结束在下一行行首时，不把那一行算进去
   const effectiveEnd = end > start && text[end - 1] === '\n' ? end - 1 : end;
   const nextBreak = text.indexOf('\n', effectiveEnd);
   const lineEnd = nextBreak === -1 ? text.length : nextBreak;

   const lines = text.slice(lineStart, lineEnd).split('\n');
   const single = lines.length === 1;
   // 多行时跳过空行（不给空行加 `- `）；单行允许在空行上直接起一个前缀
   const isTarget = (line: string) => single || line.trim() !== '';
   const allHave = lines.filter(isTarget).every((line) => hasPrefix(line, kind));

   let counter = 0;
   const next = lines.map((line) => {
      if (!isTarget(line)) return line;
      if (allHave) return removePrefix(line, kind);

      switch (kind) {
         case 'h1':
         case 'h2':
         case 'h3':
            return `${'#'.repeat(HEADING_LEVEL[kind] ?? 1)} ${line.replace(HEADING_RE, '')}`;
         case 'quote':
            return `> ${line}`;
         default: {
            const indent = LIST_MARKER_RE.exec(line)?.[1] ?? /^\s*/.exec(line)?.[0] ?? '';
            const rest = line.replace(LIST_MARKER_RE, '').replace(/^\s*/, '');
            counter++;
            const marker =
               kind === 'ul' ? '- ' : kind === 'task' ? '- [ ] ' : `${counter}. `;
            return `${indent}${marker}${rest}`;
         }
      }
   });

   const insert = next.join('\n');
   const collapsed = start === end;
   return {
      from: lineStart,
      to: lineEnd,
      insert,
      selectFrom: collapsed ? lineStart + insert.length : lineStart,
      selectTo: lineStart + insert.length,
   };
};

/** 把一个独立块（代码块 / 表格 / 分割线）放进文档，前后自动补空行，避免和相邻段落粘连 */
const insertStandaloneBlock = (
   text: string,
   start: number,
   end: number,
   block: string,
   select: [number, number]
): MarkdownEdit => {
   const before = text.slice(0, start);
   const after = text.slice(end);
   const lead =
      start === 0 || before.endsWith('\n\n')
         ? ''
         : before.endsWith('\n')
           ? '\n'
           : '\n\n';
   const trail =
      after === ''
         ? '\n'
         : after.startsWith('\n\n')
           ? ''
           : after.startsWith('\n')
             ? '\n'
             : '\n\n';
   const base = start + lead.length;
   return {
      from: start,
      to: end,
      insert: `${lead}${block}${trail}`,
      selectFrom: base + select[0],
      selectTo: base + select[1],
   };
};

/** 代码块：有选区时用围栏包起来，光标停在语言位置；无选区时插入空围栏，光标在内部 */
export const insertCodeBlock = (
   text: string,
   start: number,
   end: number
): MarkdownEdit => {
   const selected = text.slice(start, end);
   return selected
      ? insertStandaloneBlock(text, start, end, `\`\`\`\n${selected}\n\`\`\``, [3, 3])
      : insertStandaloneBlock(text, start, end, '```\n\n```', [4, 4]);
};

/** 表格：插入 3 列模板并选中第一个表头，直接输入即可覆盖 */
export const insertTable = (
   text: string,
   start: number,
   end: number
): MarkdownEdit =>
   insertStandaloneBlock(
      text,
      start,
      end,
      '| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |',
      [2, 5]
   );

/** 分割线 */
export const insertHorizontalRule = (
   text: string,
   start: number,
   end: number
): MarkdownEdit => insertStandaloneBlock(text, start, end, '---', [3, 3]);

/**
 * 链接：
 * - 选中的是网址：作为链接目标，选中「链接文本」占位
 * - 选中的是文字：作为链接文本，选中 `url` 占位
 * - 无选区：插入完整模板
 */
export const insertLink = (
   text: string,
   start: number,
   end: number
): MarkdownEdit => {
   const selected = text.slice(start, end).trim();
   const isUrl = /^(https?:\/\/|\/)\S+$/i.test(selected);

   if (isUrl) {
      const label = '链接文本';
      return {
         from: start,
         to: end,
         insert: `[${label}](${selected})`,
         selectFrom: start + 1,
         selectTo: start + 1 + label.length,
      };
   }

   const label = selected || '链接文本';
   const url = 'https://';
   const urlStart = start + 1 + label.length + 2;
   return {
      from: start,
      to: end,
      insert: `[${label}](${url})`,
      // 有选中文字 -> 光标落在 url 上；无选区 -> 先选中「链接文本」
      selectFrom: selected ? urlStart : start + 1,
      selectTo: selected ? urlStart + url.length : start + 1 + label.length,
   };
};
