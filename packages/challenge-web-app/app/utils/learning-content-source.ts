import type {
   LearningContentState,
   LearningProblemRef,
} from '~/composables/use-learning';
import { parseArticleBody } from '~/utils/learning-markdown';

/** 学习内容的数据层：服务端 DTO 与前端模型互转 */

/** 服务端 `public.learning.*` / `admin.learning.*` 返回的形状 */
export interface ServerCourse {
   id: string;
   name: string;
   description: string;
   status: 'DRAFT' | 'PENDING' | 'PUBLISHED';
   coverPreset: string;
   authorId: string;
   createdAt: Date | string;
   updatedAt: Date | string;
   reviewedAt?: Date | string | null;
   /** 编排的专题顺序，存在课程上 */
   topicIds: string[];
}

export interface ServerTopic {
   id: string;
   name: string;
   description: string;
   coverPreset: string;
   courseId: string;
   authorId: string;
   articleIds: string[];
}

export interface ServerArticle {
   id: string;
   title: string;
   summary: string;
   /** 正文 Markdown */
   source: string;
   coverPreset: string;
   coverUrl: string | null;
   authorId: string;
   createdAt: string | Date;
   author?: { name: string; avatarUrl: string | null } | null;
}

export interface ServerProblemSummary {
   baseId: number;
   pid: number;
   title: string;
   difficulty: LearningProblemRef['difficulty'];
   totalScore: number;
   available: boolean;
   /** 题目封面，空则用占位图 */
   imageName?: string | null;
   imageHash?: string | null;
   imageThumbhashUrl?: string | null;
   /** 题目标签 */
   tags?: Array<{ name: string; color: string | null }>;
}

/** cuid 到前端数字 id 的映射，用字符串哈希保证稳定 */
const idCache = new Map<string, number>();

/** FNV-1a 32 位哈希，必须是纯函数 */
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
   name: row.name,
   description: row.description,
   status:
      row.status === 'PUBLISHED'
         ? ('published' as const)
         : row.status === 'PENDING'
           ? ('pending' as const)
           : ('draft' as const),
   coverPreset: row.coverPreset as never,
   // 编排顺序随课程走：cuid 映射成前端数字 id
   topicIds: (Array.isArray(row.topicIds) ? row.topicIds : []).map(numericIdOf),
});

export const toTopic = (row: ServerTopic) => ({
   id: numericIdOf(row.id),
   cuid: row.id,
   courseId: numericIdOf(row.courseId),
   name: row.name,
   description: row.description,
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
      title: row.title,
      summary: row.summary,
      createdAt: row.createdAt ? String(row.createdAt) : undefined,
      authorName: row.author?.name,
      authorAvatarUrl: row.author?.avatarUrl ?? null,
      content: blocks,
      problems: baseIds.map((baseId) => {
         const summary = byBaseId.get(baseId);
         if (!summary) {
            // 服务端没回这道题，标为不可用
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
            // pid 以服务端实时解析的当前版本为准
            pid: summary.pid,
            title: summary.title,
            difficulty: toDifficulty(summary.difficulty),
            totalScore: summary.totalScore,
            ...(summary.available ? {} : { unavailable: true }),
            imageName: summary.imageName ?? null,
            imageHash: summary.imageHash ?? null,
            imageThumbhashUrl: summary.imageThumbhashUrl ?? null,
            tags: summary.tags ?? [],
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
   // 可用性与 pid 以服务端解析为准
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
