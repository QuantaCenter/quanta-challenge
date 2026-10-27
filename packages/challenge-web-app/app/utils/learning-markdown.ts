import type {
   ContentBlock,
   LearningArticle,
   LearningProblemRef,
} from '~/composables/use-learning';


/** 文章正文的两种表示之间的转换 */

export const PROBLEM_DIRECTIVE_PATTERN = /<Problem\s+baseId=\{(\d+)\}\s*\/>/g;

/** 解析期用的占位符：形如 @@problem:6@@ ，正文里不会出现这种字符串 */
const PROBLEM_SLOT_PREFIX = '@@problem:';
const PROBLEM_SLOT_SUFFIX = '@@';
const PROBLEM_SLOT_PATTERN = /^@@problem:(\d+)@@$/;

export const problemDirective = (baseId: number) =>
   `<Problem baseId={${baseId}} />`;

/** 正文的有序内容：方块与题目按出现顺序排列 */
export type ArticleContentItem =
   | { kind: 'block'; block: ContentBlock }
   | { kind: 'problem'; problem: LearningProblemRef };

/** 段落里的题目占位符，指令可能和文字挤在同一行 */
const SLOT_IN_TEXT = /@@problem:(\d+)@@/g;

/** 把一个段落里的题目占位符拆成「文字块 + 题目块」 */
const splitParagraphSlots = (
   text: string,
   take: (baseId: number) => LearningProblemRef | undefined,
   emit: (item: ArticleContentItem) => void,
) => {
   let cursor = 0;
   for (const match of text.matchAll(SLOT_IN_TEXT)) {
      const before = text.slice(cursor, match.index).trim();
      if (before) emit({ kind: 'block', block: { type: 'paragraph', text: before } });

      const problem = take(Number(match[1]));
      if (problem) emit({ kind: 'problem', problem });

      cursor = match.index + match[0].length;
   }
   const rest = text.slice(cursor).trim();
   if (rest) emit({ kind: 'block', block: { type: 'paragraph', text: rest } });
};

/** 正文源码解析成方块，题目指令替换成占位符 */
export const parseArticleBody = (body: string): { blocks: ContentBlock[] } => {
   // 指令替换成一个不会与正文冲突的占位段落：解析后它在序列里的位置就是题目的位置
   const markdown = body.replace(
      PROBLEM_DIRECTIVE_PATTERN,
      (_match, id: string) => `${PROBLEM_SLOT_PREFIX}${id}${PROBLEM_SLOT_SUFFIX}`,
   );
   const blocks: ContentBlock[] = [];
   const lines = markdown.split('\n');

   let paragraph: string[] = [];
   let list: string[] = [];
   let code: { lang: string; lines: string[] } | null = null;

   const flushParagraph = () => {
      if (paragraph.length === 0) return;
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
   };
   const flushList = () => {
      if (list.length === 0) return;
      blocks.push({ type: 'list', items: [...list] });
      list = [];
   };

   for (const line of lines) {
      const fence = /^```(\w*)\s*$/.exec(line);
      if (code) {
         if (fence) {
            blocks.push({
               type: 'code',
               lang: code.lang,
               text: code.lines.join('\n'),
            });
            code = null;
         } else {
            code.lines.push(line);
         }
         continue;
      }
      if (fence) {
         flushParagraph();
         flushList();
         code = { lang: fence[1] ?? '', lines: [] };
         continue;
      }

      if (line.startsWith('## ')) {
         flushParagraph();
         flushList();
         blocks.push({ type: 'heading', text: line.slice(3).trim() });
         continue;
      }
      if (line.startsWith('> ')) {
         flushParagraph();
         flushList();
         blocks.push({ type: 'callout', text: line.slice(2).trim() });
         continue;
      }
      if (/^[-*] /.test(line)) {
         flushParagraph();
         list.push(line.slice(2).trim());
         continue;
      }
      if (line.trim() === '') {
         flushParagraph();
         flushList();
         continue;
      }

      flushList();
      paragraph.push(line.trim());
   }
   if (code) {
      blocks.push({ type: 'code', lang: code.lang, text: code.lines.join('\n') });
   }
   flushParagraph();
   flushList();

   return { blocks };
};

/** 结构化正文 → Markdown 源码：文章编辑页就是在这个形状上编辑 */
export const renderArticleSource = (article: LearningArticle): string => {
   const blocks = article.content
      .map((block) => {
         if (block.type === 'heading') return `## ${block.text}`;
         if (block.type === 'paragraph') return block.text;
         if (block.type === 'list') {
            return block.items.map((item) => `- ${item}`).join('\n');
         }
         if (block.type === 'code') {
            return `\`\`\`${block.lang}\n${block.text}\n\`\`\``;
         }
         if (block.type === 'callout') return `> ${block.text}`;
         return '';
      })
      .join('\n\n');

   const practice = article.problems
      .map((problem) => problemDirective(problem.baseId))
      .join('\n\n');

   return practice ? `${blocks}\n\n${practice}` : blocks;
};

/** 方块与题目按正文顺序合并 */
export const toContentItems = (
   blocks: ContentBlock[],
   problems: LearningProblemRef[],
): ArticleContentItem[] => {
   const byBaseId = new Map(problems.map((problem) => [problem.baseId, problem]));
   const take = (baseId: number) => byBaseId.get(baseId);
   const items: ArticleContentItem[] = [];

   for (const block of blocks) {
      // 段落：可能整段就是一个指令，也可能指令夾在文字中间
      if (block.type === 'paragraph' && block.text.includes(PROBLEM_SLOT_PREFIX)) {
         splitParagraphSlots(block.text, take, (item) => items.push(item));
         continue;
      }

      // 列表项：整项就是一个指令时替换成题目块，否则原样保留
      if (block.type === 'list') {
         const remaining: string[] = [];
         for (const entry of block.items) {
            const slot = PROBLEM_SLOT_PATTERN.exec(entry.trim());
            const problem = slot ? take(Number(slot[1])) : undefined;
            if (!problem) {
               remaining.push(entry);
               continue;
            }
            if (remaining.length > 0) {
               items.push({
                  kind: 'block',
                  block: { type: 'list', items: [...remaining] },
               });
               remaining.length = 0;
            }
            items.push({ kind: 'problem', problem });
         }
         if (remaining.length > 0) {
            items.push({ kind: 'block', block: { type: 'list', items: remaining } });
         }
         continue;
      }

      items.push({ kind: 'block', block });
   }

   return items;
};

/** 文章正文的有序内容（方块与题目交错） */
export const articleContentItems = (
   article: LearningArticle,
): ArticleContentItem[] => toContentItems(article.content, article.problems);
