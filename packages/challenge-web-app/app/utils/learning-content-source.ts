import type { LearningProblemRef } from '~/composables/use-learning';
import type { LearningContentState } from '~/utils/learning-content-ops';
import { parseArticleBody } from '~/utils/learning-markdown';

/**
 * 学习内容的**前端数据层**：只在「服务端 DTO ↔ 前端模型」之间转换。
 *
 * 为什么还要这一层：服务端存的是**正文 Markdown**（唯一真源），
 * 而页面渲染要的是 `ContentBlock[]` + 题目引用列表（从正文解析出来的派生数据）。
 * 转换只发生在这里，页面拿到的形状与以前（localStorage 时代）完全一致，
 * 所以页面代码不用改。
 */

/** 服务端 `public.learning.*` / `admin.learning.*` 返回的形状 */
export interface ServerCourse {
   id: string;
   slug: string;
   name: string;
   description: string;
   weight: number;
   status: 'DRAFT' | 'PENDING' | 'PUBLISHED';
   coverPreset: string;
   authorId: string;
   createdAt: Date | string;
   updatedAt: Date | string;
   reviewedAt?: Date | string | null;
}

export interface ServerTopic {
   id: string;
   slug: string;
   name: string;
   description: string;
   weight: number;
   coverPreset: string;
   courseId: string;
   authorId: string;
   articleIds: string[];
   prerequisites: string[];
}

export interface ServerArticle {
   id: string;
   slug: string;
   title: string;
   summary: string;
   /** 正文 Markdown（含 `<Problem baseId={…} />`） */
   source: string;
   coverPreset: string;
   coverUrl: string | null;
   authorId: string;
}

export interface ServerProblemSummary {
   baseId: number;
   pid: number;
   title: string;
   difficulty: LearningProblemRef['difficulty'];
   totalScore: number;
   available: boolean;
}

/**
 * 前端 id 是 number（历史原因：路由参数、进度记录、收藏都用数字），
 * 服务端主键是 cuid。这里把 cuid 映射成稳定的数字：
 * 用「出现顺序 + 基数」不靠谱（翻页会变），所以用字符串哈希，
 * 保证同一实体在任何页面 / 任何会话都得到同一个数字。
 */
const idCache = new Map<string, number>();

/**
 * FNV-1a 32 位哈希，取正整数。
 *
 * ⚠️ 必须是**纯函数**：只由 cuid 决定，不能依赖「遇到了哪些实体、以什么顺序遇到」。
 * 否则刷新一次页面、或先打开文章页再打开课程页，同一个实体就会算出不同的数字 id，
 * 书签、进度记录、收藏都会指向错的东西。哈希冲突（两个 cuid 撞同一个数字）概率极低，
 * 真撞了也只是两个条目互相串号，比"每次刷新都变"轻得多。
 */
const hashToNumber = (value: string): number => {
   let hash = 0x811c9dc5;
   for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
   }
   return hash >>> 1; // 去符号位
};

export const numericIdOf = (cuid: string): number => {
   const cached = idCache.get(cuid);
   if (cached !== undefined) return cached;
   const value = hashToNumber(cuid);
   idCache.set(cuid, value);
   return value;
};

/** 反向查回 cuid：写接口要的是字符串主键 */
export const cuidOf = (numericId: number): string | undefined => {
   for (const [cuid, id] of idCache) {
      if (id === numericId) return cuid;
   }
   return undefined;
};

const toDifficulty = (value: string): LearningProblemRef['difficulty'] =>
   value === 'medium' || value === 'hard' || value === 'very_hard'
      ? value
      : 'easy';

export const toCourse = (row: ServerCourse) => ({
   id: numericIdOf(row.id),
   cuid: row.id,
   slug: row.slug,
   name: row.name,
   description: row.description,
   weight: row.weight,
   status:
      row.status === 'PUBLISHED'
         ? ('published' as const)
         : row.status === 'PENDING'
           ? ('pending' as const)
           : ('draft' as const),
   coverPreset: row.coverPreset as never,
});

export const toTopic = (row: ServerTopic) => ({
   id: numericIdOf(row.id),
   cuid: row.id,
   courseId: numericIdOf(row.courseId),
   slug: row.slug,
   name: row.name,
   description: row.description,
   weight: row.weight,
   prerequisites: row.prerequisites.map(numericIdOf),
   articleIds: row.articleIds.map(numericIdOf),
   coverPreset: row.coverPreset as never,
});

export const toArticle = (
   row: ServerArticle,
   problems: ServerProblemSummary[],
) => {
   const { blocks } = parseArticleBody(row.source);
   const byBaseId = new Map(problems.map((item) => [item.baseId, item]));
   const baseIds = [
      ...new Set(
         [...row.source.matchAll(/<Problem\s+baseId=\{(\d+)\}\s*\/>/g)].map(
            (match) => Number(match[1]),
         ),
      ),
   ];

   return {
      id: numericIdOf(row.id),
      cuid: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      content: blocks,
      problems: baseIds.map((baseId) => {
         const summary = byBaseId.get(baseId);
         if (!summary) {
            // 服务端没回这道题（题库接口失败）：标为不可用，而不是显示成正常题
            return {
               baseId,
               pid: baseId,
               title: `未知题目 #${baseId}`,
               difficulty: 'easy' as const,
               totalScore: 0,
               unavailable: true,
            };
         }
         return {
            baseId,
            // 关键：pid 用**服务端实时解析出来的当前版本**，
            // 不能用文章里存的旧版本号（重新发布会生成新 pid）
            pid: summary.pid,
            title: summary.title,
            difficulty: toDifficulty(summary.difficulty),
            totalScore: summary.totalScore,
            ...(summary.available ? {} : { unavailable: true }),
         };
      }),
      source: row.source,
      coverPreset: row.coverPreset as never,
      ...(row.coverUrl ? { coverUrl: row.coverUrl } : {}),
   };
};

/** 一次拉全：课程 + 专题 + 文章 + 题目摘要，组装成页面要的形状 */
export const fetchLearningContent = async (
   trpc: {
      public: {
         learning: {
            courses: { query: () => Promise<ServerCourse[]> };
            topics: { query: (input: object) => Promise<ServerTopic[]> };
            articles: { query: (input: object) => Promise<ServerArticle[]> };
            problems: {
               query: (input: { baseIds: number[] }) => Promise<
                  ServerProblemSummary[]
               >;
            };
         };
      };
   },
): Promise<LearningContentState> => {
   const [courses, topics, articles] = await Promise.all([
      trpc.public.learning.courses.query(),
      trpc.public.learning.topics.query({}),
      trpc.public.learning.articles.query({}),
   ]);

   const baseIds = [
      ...new Set(
         articles.flatMap((article) =>
            [...article.source.matchAll(/<Problem\s+baseId=\{(\d+)\}\s*\/>/g)].map(
               (match) => Number(match[1]),
            ),
         ),
      ),
   ];
   // 这里同样用服务端实时解析的可用性；pid 也以它为准
   const problems =
      baseIds.length > 0
         ? await trpc.public.learning.problems.query({ baseIds })
         : [];

   return {
      courses: courses.map(toCourse) as never,
      topics: topics.map(toTopic) as never,
      articles: articles.map((article) => toArticle(article, problems)) as never,
   };
};
