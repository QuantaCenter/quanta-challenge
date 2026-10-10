import prisma from '~~/lib/prisma';
import type { Prisma } from '@prisma/client';

/**
 * 学习内容的**读取**服务：课程 / 专题 / 文章。
 *
 * 这一层只做两件事：查库 + 按 §17.4 的可见性规则裁剪。
 * 可见性规则集中在这里，别散进路由：
 *   · 课程：只有 PUBLISHED 对外；创作侧可以按 id 取自己的草稿/待审
 *   · 专题：其课程 PUBLISHED 才对外
 *   · 文章：**始终对外**（一等实体，不受专题/课程状态影响）
 */

/** 学习侧与创作侧共用的课程字段 */
const courseSelect = {
   id: true,
   slug: true,
   name: true,
   description: true,
   weight: true,
   status: true,
   coverPreset: true,
   authorId: true,
   createdAt: true,
   updatedAt: true,
   reviewedAt: true,
} satisfies Prisma.CourseSelect;

export const topicSelect = {
   id: true,
   slug: true,
   name: true,
   description: true,
   weight: true,
   coverPreset: true,
   courseId: true,
   authorId: true,
   createdAt: true,
   updatedAt: true,
   Articles: {
      orderBy: { sort: 'asc' },
      select: { articleId: true, sort: true },
   },
   Prerequisites: { select: { prerequisiteId: true } },
} satisfies Prisma.TopicSelect;

const articleSelect = {
   id: true,
   slug: true,
   title: true,
   summary: true,
   source: true,
   coverPreset: true,
   coverUrl: true,
   authorId: true,
   createdAt: true,
   updatedAt: true,
   Problems: {
      orderBy: { sort: 'asc' },
      select: { baseId: true, sort: true },
   },
} satisfies Prisma.ArticleSelect;

export type CourseRow = Prisma.CourseGetPayload<{ select: typeof courseSelect }>;
export type TopicRow = Prisma.TopicGetPayload<{ select: typeof topicSelect }>;
export type ArticleRow = Prisma.ArticleGetPayload<{
   select: typeof articleSelect;
}>;

/** 前端要的形状：把关联表压成 id 数组，顺序即 sort */
export const toCourseDto = (row: CourseRow) => ({ ...row, status: row.status });

export const toTopicDto = (row: TopicRow) => ({
   id: row.id,
   slug: row.slug,
   name: row.name,
   description: row.description,
   weight: row.weight,
   coverPreset: row.coverPreset,
   courseId: row.courseId,
   authorId: row.authorId,
   createdAt: row.createdAt,
   updatedAt: row.updatedAt,
   articleIds: row.Articles.map((item) => item.articleId),
   prerequisites: row.Prerequisites.map((item) => item.prerequisiteId),
});

export const toArticleDto = (row: ArticleRow) => ({
   id: row.id,
   slug: row.slug,
   title: row.title,
   summary: row.summary,
   source: row.source,
   coverPreset: row.coverPreset,
   coverUrl: row.coverUrl,
   authorId: row.authorId,
   createdAt: row.createdAt,
   updatedAt: row.updatedAt,
   problems: row.Problems.map((item) => item.baseId),
});

export type CourseDto = ReturnType<typeof toCourseDto>;
export type TopicDto = ReturnType<typeof toTopicDto>;
export type ArticleDto = ReturnType<typeof toArticleDto>;

/* ---------- 学习侧（只读，只看 PUBLISHED） ---------- */

export const listPublishedCourses = async () =>
   (
      await prisma.course.findMany({
         where: { status: 'PUBLISHED' },
         orderBy: [{ weight: 'asc' }, { id: 'asc' }],
         select: courseSelect,
      })
   ).map(toCourseDto);

export const findPublishedCourse = async (id: string) => {
   const row = await prisma.course.findFirst({
      where: { id, status: 'PUBLISHED' },
      select: courseSelect,
   });
   return row ? toCourseDto(row) : null;
};

/** 学习侧的全部专题：只包含已上架课程下的 */
export const listPublishedTopics = async (courseId?: string) =>
   (
      await prisma.topic.findMany({
         where: {
            Course: { status: 'PUBLISHED' },
            ...(courseId ? { courseId } : {}),
         },
         orderBy: [{ courseId: 'asc' }, { weight: 'asc' }, { id: 'asc' }],
         select: topicSelect,
      })
   ).map(toTopicDto);

export const findPublishedTopic = async (id: string) => {
   const row = await prisma.topic.findFirst({
      where: { id, Course: { status: 'PUBLISHED' } },
      select: topicSelect,
   });
   return row ? toTopicDto(row) : null;
};

/** 文章始终对外（§17.4）：不受专题 / 课程状态影响 */
/**
 * 全部专题（**不过滤状态**）：创作侧的选择器需要看到草稿 / 待审课程下的专题，
 * 否则「刚建的专题」在编排里找不到。
 */
export const listAllTopics = async () =>
   (
      await prisma.topic.findMany({
         orderBy: [{ weight: 'asc' }, { id: 'asc' }],
         select: topicSelect,
      })
   ).map(toTopicDto);

export const listArticles = async (ids?: string[]) =>
   (
      await prisma.article.findMany({
         where: ids && ids.length > 0 ? { id: { in: ids } } : undefined,
         orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
         select: articleSelect,
      })
   ).map(toArticleDto);

export const findArticle = async (id: string) => {
   const row = await prisma.article.findUnique({
      where: { id },
      select: articleSelect,
   });
   return row ? toArticleDto(row) : null;
};

/**
 * 文章引用的题目：把 `baseId` 解析成**当前发布的版本 pid**。
 *
 * 为什么必须实时解析：正文只写 `baseId`（题号），而「重新发布」会生成新的 pid。
 * 如果文章页沿用旧的 pid，就会：
 *   · 点到已作废的版本 → 做题页打不开（表现为"一闪就黑了"）；
 *   · 题目下架后仍然给出可点链接。
 * 所以每次读文章都把 baseId → 当前 pid 算一遍。
 */
/**
 * 题号的解析状态（给文章卡片 / 做题页用）。
 *
 * 三种情况必须分开，否则文案会骗人：
 *   · `missing`      —— 题号不存在（题被删了）
 *   · `unpublished`  —— 这个版本被作者下架了（还会再上架）
 *   · `replaced`     —— 当前版本被停用、且已有更新的版本（不是"下架"）
 */
export const resolveProblemState = async (baseId: number) => {
   const row = await prisma.baseProblems.findUnique({
      where: { id: baseId },
      select: {
         CurrentProblem: { select: { pid: true, status: true } },
         ProblemVersions: {
            where: { status: 'published' },
            orderBy: { pid: 'desc' },
            select: { pid: true },
            take: 1,
         },
      },
   });
   if (!row) return { state: 'missing' as const, pid: null };

   const current = row.CurrentProblem;
   if (current?.status === 'published') {
      return { state: 'published' as const, pid: current.pid };
   }
   // 当前版本不是已发布，但存在更新的已发布版本 → 被取代（链接应跟随新版本）
   if (row.ProblemVersions.length > 0) {
      return { state: 'replaced' as const, pid: row.ProblemVersions[0]!.pid };
   }
   return { state: 'unpublished' as const, pid: null };
};

/** 题号的**当前已发布版本** pid；未发布 / 不存在都返回 null */
export const findPublishedProblemPid = async (baseId: number) => {
   const row = await prisma.baseProblems.findUnique({
      where: { id: baseId },
      select: { CurrentProblem: { select: { pid: true, status: true } } },
   });
   return row?.CurrentProblem?.status === 'published'
      ? row.CurrentProblem.pid
      : null;
};

/**
 * 按 **pid** 解析题号与可用性（公开）。
 *
 * 做题页地址里的是 pid，而"下架"是个公开可判定的事实，不需要用户态：
 * 之前用 `protected.problem.getProblemDetail` 判权限，未登录/权限不足时会
 * 抛 UNAUTHORIZED，结果把**正常已发布的题也拦掉**（表现为一进就被弹回题库）。
 */
export const resolveProblemByPid = async (pid: number) => {
   const row = await prisma.problems.findUnique({
      where: { pid },
      select: { pid: true, baseId: true, status: true, title: true },
   });
   if (!row) return null;
   // 顺带给出"最新可做版本"，让做题页能把用户带到新版本，而不是干说不可用
   const state = await resolveProblemState(row.baseId);
   return {
      pid: row.pid,
      baseId: row.baseId,
      title: row.title,
      published: row.status === 'published',
      state: state.state,
      latestPid: state.pid,
   };
};

export const resolveArticleProblems = async (baseIds: number[]) => {
   const summaries = await listProblemSummaries(baseIds);
   return summaries.map((item) => ({
      baseId: item.baseId,
      pid: item.pid,
      title: item.title,
      difficulty: item.difficulty,
      totalScore: item.totalScore,
      // available=false 前端会渲染成「该题目不可用」且不给链接
      available: item.available,
   }));
};

/**
 * 题目摘要：学习侧要把 `baseId` 渲染成题目卡片（标题/难度/分值）
 * 与「引用已失效」的标记，所以单独给一个只读接口。
 * 只回**已发布**的题，其余标 `available: false`。
 */
export const listProblemSummaries = async (baseIds: number[]) => {
   if (baseIds.length === 0) return [];
   const rows = await prisma.baseProblems.findMany({
      where: { id: { in: baseIds } },
      select: {
         id: true,
         CurrentProblem: {
            select: {
               pid: true,
               title: true,
               difficulty: true,
               totalScore: true,
               status: true,
            },
         },
      },
   });

   const byBaseId = new Map(rows.map((row) => [row.id, row]));
   return baseIds.map((baseId) => {
      const row = byBaseId.get(baseId);
      const current = row?.CurrentProblem;
      const published = current?.status === 'published';
      return {
         baseId,
         pid: current?.pid ?? baseId,
         title: current?.title ?? `未知题目 #${baseId}`,
         difficulty: current?.difficulty ?? 'easy',
         totalScore: current?.totalScore ?? 0,
         available: published,
      };
   });
};
