import {
   PROBLEM_REGISTRY,
} from '~/composables/learning-content';
import type {
   ContentBlock,
   LearningArticle,
   LearningProblemRef,
} from '~/composables/use-learning';


/**
 * 文章正文的两种表示之间的转换。
 *
 * · 真源：Markdown 源码，插入题目处写 `<Problem baseId={…} />`（设计文档 §13.3）；
 * · 渲染：`ContentBlock[]` + 题目引用列表 —— 文章页按方块排版，题目在正文下方单独成列。
 *
 * 放在 `app/utils/` 而不是 `composables/` 是刻意的：这两个函数不是 composable，
 * 放进 composables 会被 Nuxt 自动导入，与 `use-learning.ts` 的显式转出口重名。
 */

/**
 * 从正文占位符还原题目引用。
 *
 * 这里只是**兜底**（种子内容、或服务端还没回数据时的那一帧）：
 *   · 注册表里有的题，用它给出的题号/标题等元信息；
 *   · 注册表里没有的题，**必须标成不可用，且不要伪造 pid**。
 *
 * 为什么强调不能伪造 pid：`pid` 与 `baseId` 是两套编号，会互相撞号。
 * 曾经把 `pid: baseId` 当成兜底，于是「baseId=7 的题」在兜底路径下写成 pid=7，
 * 而 pid=7 恰好是另一道题 —— 点进去就串题了。真实 pid 只由服务端解析
 * （`public.learning.problems` → `/challenge/editor/by-base/:baseId`）。
 */
const problemRefOf = (baseId: number): LearningProblemRef => {
   const known = PROBLEM_REGISTRY.find((problem) => problem.baseId === baseId);
   if (!known) {
      // 题号不在注册表里（被删了，或手写错了）：标注不可用，界面显示「已下架」，
      // 并且不给做题入口。
      return {
         baseId,
         pid: 0,
         title: `未知题目 #${baseId}`,
         difficulty: 'medium',
         totalScore: 0,
         unavailable: true,
      };
   }
   return { ...known };
};

export const PROBLEM_DIRECTIVE_PATTERN = /<Problem\s+baseId=\{(\d+)\}\s*\/>/g;

/** 解析期用的占位符：形如 @@problem:6@@ ，正文里不会出现这种字符串 */
const PROBLEM_SLOT_PREFIX = '@@problem:';
const PROBLEM_SLOT_SUFFIX = '@@';
const PROBLEM_SLOT_PATTERN = /^@@problem:(\d+)@@$/;

export const problemDirective = (baseId: number) =>
   `<Problem baseId={${baseId}} />`;

/**
 * 正文的有序内容：方块与题目**按在正文里出现的顺序**排在一起。
 *
 * 这是「题目必须写在正文中间」这个要求（设计文档 §13.3）的落点：
 * 文章页按这个序列渲染，`<Problem>` 出现在被写到的位置，
 * 而不是被收集到文末的「本篇题目」栏里。
 */
export type ArticleContentItem =
   | { kind: 'block'; block: ContentBlock }
   | { kind: 'problem'; problem: LearningProblemRef };

/**
 * 段落里的题目指令占位符。
 *
 * 指令可能和文字挤在同一行（编辑器就是这么写的）：
 *   `大概就是谁饿了不吃饭啊？<Problem baseId={6} /><Problem baseId={7} />`
 * 所以解析完还要按占位符把段落切开，让每道题都成为独立的一条内容。
 */
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

/** 抽出的题目引用与正文分开返回（块里保留占位符，交由 toContentItems 裁决顺序） */
export const parseArticleBody = (
   body: string,
): { blocks: ContentBlock[]; problems: LearningProblemRef[] } => {
   const problems: LearningProblemRef[] = [];
   for (const match of body.matchAll(PROBLEM_DIRECTIVE_PATTERN)) {
      const baseId = Number(match[1]);
      if (!problems.some((problem) => problem.baseId === baseId)) {
         problems.push(problemRefOf(baseId));
      }
   }

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

   return { blocks, problems };
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

/**
 * 方块与题目按正文顺序合并。
 *
 * 解析时题目被换成了 `@@problem:<baseId>@@` 占位段落，所以只要在方块里找到它，
 * 就能知道这道题写在正文的哪个位置。
 */
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
