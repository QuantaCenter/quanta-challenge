import prisma from '~~/lib/prisma';
import type { Prisma } from '@prisma/client';
import { renderThumbhashDataUrls } from '~~/server/utils/thumbhash';

/**
 * 学习内容的读取服务，集中处理可见性规则。
 */

/** 学习侧与创作侧共用的课程字段 */
const courseSelect = {
   id: true,
   name: true,
   description: true,
   status: true,
   coverPreset: true,
   authorId: true,
   createdAt: true,
   updatedAt: true,
   reviewedAt: true,
   topicIds: true,
} satisfies Prisma.CourseSelect;

export const topicSelect = {
   id: true,
   name: true,
   description: true,
   coverPreset: true,
   courseId: true,
   authorId: true,
   createdAt: true,
   updatedAt: true,
   Articles: {
      orderBy: { sort: 'asc' },
      select: { articleId: true, sort: true },
   },
} satisfies Prisma.TopicSelect;

const articleSelect = {
   id: true,
   title: true,
   summary: true,
   source: true,
   coverPreset: true,
   coverUrl: true,
   authorId: true,
   createdAt: true,
   updatedAt: true,
   Author: {
      select: {
         name: true,
         displayName: true,
         avatar: { select: { name: true } },
      },
   },
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
   name: row.name,
   description: row.description,
   coverPreset: row.coverPreset,
   courseId: row.courseId,
   authorId: row.authorId,
   createdAt: row.createdAt,
   updatedAt: row.updatedAt,
   articleIds: row.Articles.map((item) => item.articleId),
});

export const toArticleDto = (row: ArticleRow) => ({
   id: row.id,
   title: row.title,
   summary: row.summary,
   source: row.source,
   coverPreset: row.coverPreset,
   coverUrl: row.coverUrl,
   authorId: row.authorId,
   createdAt: row.createdAt,
   updatedAt: row.updatedAt,
   author: {
      name: row.Author.displayName || row.Author.name,
      avatarUrl: row.Author.avatar?.name
         ? `/api/static/${row.Author.avatar.name}`
         : null,
   },
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
         orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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
         orderBy: [{ courseId: 'asc' }, { id: 'asc' }],
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

/** 全部专题不过滤状态，创作侧选择器使用 */
export const listAllTopics = async () =>
   (
      await prisma.topic.findMany({
         orderBy: [{ courseId: 'asc' }, { id: 'asc' }],
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

/** 题号的解析状态：missing / unpublished / replaced / published */
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
   // 存在更新的已发布版本，链接应跟随新版本
   if (row.ProblemVersions.length > 0) {
      return { state: 'replaced' as const, pid: row.ProblemVersions[0]!.pid };
   }
   return { state: 'unpublished' as const, pid: null };
};

/** 题号当前已发布版本的 pid */
export const findPublishedProblemPid = async (baseId: number) => {
   const row = await prisma.baseProblems.findUnique({
      where: { id: baseId },
      select: { CurrentProblem: { select: { pid: true, status: true } } },
   });
   return row?.CurrentProblem?.status === 'published'
      ? row.CurrentProblem.pid
      : null;
};

/** 按 pid 公开解析题号与可用性 */
export const resolveProblemByPid = async (pid: number) => {
   const row = await prisma.problems.findUnique({
      where: { pid },
      select: { pid: true, baseId: true, status: true, title: true },
   });
   if (!row) return null;
   // 顺带给出最新可做版本
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
      // 不可用时前端不给链接
      available: item.available,
      imageName: item.imageName,
      imageHash: item.imageHash,
      imageThumbhashUrl: item.imageThumbhashUrl,
      tags: item.tags,
   }));
};

/** 题目摘要，只回已发布的题，其余标 available: false */
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
               tags: { select: { name: true, color: true } },
               CoverImage: { select: { name: true, thumbhash: true } },
               ProblemDefaultCover: {
                  select: { image: { select: { name: true, thumbhash: true } } },
               },
            },
         },
      },
   });

   const byBaseId = new Map(rows.map((row) => [row.id, row]));
   const summaries = baseIds.map((baseId) => {
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
         // 无封面必须返回 null，前端才能走占位图
         imageName:
            current?.CoverImage?.name ||
            current?.ProblemDefaultCover?.[0]?.image?.name ||
            null,
         imageHash:
            current?.CoverImage?.thumbhash ||
            current?.ProblemDefaultCover?.[0]?.image?.thumbhash ||
            null,
         tags: current?.tags ?? [],
      };
   });

   // 在服务端把 thumbhash 解码成 data URL
   const thumbhashUrls = await renderThumbhashDataUrls(
      summaries.map((item) => item.imageHash),
   );
   return summaries.map((item, index) => ({
      ...item,
      imageThumbhashUrl: thumbhashUrls[index],
   }));
};
