import prisma from '~~/lib/prisma';
import { TRPCError } from '@trpc/server';
import type { CourseStatus } from '@prisma/client';
import {
   findArticle,
   findPublishedCourse,
   toArticleDto,
   toTopicDto,
   type ArticleDto,
   type TopicDto,
} from './learning-read';

/**
 * 学习内容的写入服务：文章 / 专题 / 课程的增删改 + 课程审核。
 */

const conflict = (message: string, hint: string) =>
   new TRPCError({ code: 'CONFLICT', message: `${message}（${hint}）` });

const badRequest = (message: string) =>
   new TRPCError({ code: 'BAD_REQUEST', message });

/** 正文里的 `<Problem baseId={…} />` 是文章引用题目的唯一真源 */
export const parseProblemBaseIds = (source: string): number[] => {
   const pattern = /<Problem\s+baseId=\{(\d+)\}\s*\/>/g;
   const ids: number[] = [];
   for (const match of source.matchAll(pattern)) {
      const baseId = Number(match[1]);
      if (!ids.includes(baseId)) ids.push(baseId);
   }
   return ids;
};

/** 校验正文引用的题号都存在且已发布，返回按出现顺序去重后的题号 */
const assertProblemsPublished = async (source: string): Promise<number[]> => {
   const baseIds = parseProblemBaseIds(source);
   if (baseIds.length === 0) return [];

   const rows = await prisma.baseProblems.findMany({
      where: { id: { in: baseIds } },
      select: { id: true, CurrentProblem: { select: { status: true } } },
   });
   const published = new Set(
      rows
         .filter((row) => row.CurrentProblem?.status === 'published')
         .map((row) => row.id),
   );

   const missing = baseIds.filter((baseId) => !published.has(baseId));
   if (missing.length > 0) {
      throw badRequest(
         `正文引用了不存在或未发布的题目：${missing.join('、')}。` +
            '只能引用已发布的题，否则学习者会看到一个永远打不开的卡片。',
      );
   }
   return baseIds;
};

/* ---------- 文章 ---------- */

export interface ArticleInput {
   title: string;
   summary: string;
   source: string;
   coverPreset: string;
   coverUrl?: string | null;
}

export const createArticle = async (
   authorId: string,
   input: ArticleInput,
): Promise<ArticleDto> => {
   const baseIds = await assertProblemsPublished(input.source);

   const row = await prisma.article.create({
      data: {
         authorId,
         title: input.title,
         summary: input.summary,
         source: input.source,
         coverPreset: input.coverPreset,
         coverUrl: input.coverUrl ?? null,
         Problems: {
            create: baseIds.map((baseId, index) => ({ baseId, sort: index })),
         },
      },
      select: { id: true },
   });

   const created = await findArticle(row.id);
   if (!created) throw badRequest('文章创建后读取失败');
   return created;
};

export const updateArticle = async (
   id: string,
   input: ArticleInput,
): Promise<ArticleDto> => {
   const current = await prisma.article.findUnique({
      where: { id },
      select: { id: true },
   });
   if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: '没有这篇文章' });

   const baseIds = await assertProblemsPublished(input.source);

   // 正文是真源：引用表整体重算
   await prisma.$transaction([
      prisma.article.update({
         where: { id },
         data: {
            title: input.title,
            summary: input.summary,
            source: input.source,
            coverPreset: input.coverPreset,
            coverUrl: input.coverUrl ?? null,
         },
      }),
      prisma.articleProblem.deleteMany({ where: { articleId: id } }),
      prisma.articleProblem.createMany({
         data: baseIds.map((baseId, index) => ({
            articleId: id,
            baseId,
            sort: index,
         })),
      }),
   ]);

   const updated = await findArticle(id);
   if (!updated) throw badRequest('文章更新后读取失败');
   return updated;
};

export const deleteArticle = async (id: string) => {
   const refs = await prisma.topicArticle.findMany({
      where: { articleId: id },
      select: { Topic: { select: { name: true, Course: { select: { name: true } } } } },
   });
   if (refs.length > 0) {
      const owners = refs
         .map((ref) => `${ref.Topic.Course.name} / ${ref.Topic.name}`)
         .join('、');
      throw conflict('这篇文章还被专题引用，不能删除', `引用它的专题：${owners}`);
   }
   await prisma.article.delete({ where: { id } });
   return { id };
};

/* ---------- 专题 ---------- */

export interface TopicInput {
   courseId: string;
   name: string;
   description: string;
   coverPreset: string;
   articleIds: string[];
}

const assertArticleIdsExist = async (articleIds: string[]) => {
   if (articleIds.length === 0) return;
   const found = await prisma.article.count({
      where: { id: { in: articleIds } },
   });
   if (found !== articleIds.length) {
      throw badRequest('引用了不存在的文章');
   }
};

const assertTopicRefsValid = async (courseId: string) => {
   const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true },
   });
   if (!course) throw badRequest('归属的课程不存在');
};

export const createTopic = async (
   authorId: string,
   input: TopicInput,
): Promise<TopicDto> => {
   await assertTopicRefsValid(input.courseId);
   await assertArticleIdsExist(input.articleIds);

   const row = await prisma.topic.create({
      data: {
         authorId,
         courseId: input.courseId,
         name: input.name,
         description: input.description,
         coverPreset: input.coverPreset,
         Articles: {
            create: input.articleIds.map((articleId, index) => ({
               articleId,
               sort: index,
            })),
         },
      },
      select: {
         id: true,
         name: true,
         description: true,
         coverPreset: true,
         courseId: true,
         authorId: true,
         createdAt: true,
         updatedAt: true,
         Articles: { orderBy: { sort: 'asc' }, select: { articleId: true, sort: true } },
      },
   });
   return toTopicDto(row);
};

export const updateTopic = async (
   id: string,
   input: TopicInput,
): Promise<TopicDto> => {
   const current = await prisma.topic.findUnique({
      where: { id },
      select: { id: true, courseId: true, Course: { select: { status: true } } },
   });
   if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: '没有这个专题' });

   await assertTopicRefsValid(input.courseId);
   await assertArticleIdsExist(input.articleIds);

   const row = await prisma.$transaction(async (tx) => {
      await tx.topic.update({
         where: { id },
         data: {
            courseId: input.courseId,
            name: input.name,
            description: input.description,
            coverPreset: input.coverPreset,
         },
      });
      await tx.topicArticle.deleteMany({ where: { topicId: id } });
      await tx.topicArticle.createMany({
         data: input.articleIds.map((articleId, index) => ({
            topicId: id,
            articleId,
            sort: index,
         })),
      });
      return tx.topic.findUniqueOrThrow({
         where: { id },
         select: {
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
         },
      });
   });
   return toTopicDto(row);
};

export const deleteTopic = async (id: string) => {
   await prisma.topic.delete({ where: { id } });
   return { id };
};

/* ---------- 课程 + 审核 ---------- */

export interface CourseInput {
   name: string;
   description: string;
   coverPreset: string;
   topicIds: string[];
}

const courseDetail = {
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
} as const;

const writeReviewRecord = async (
   tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
   options: {
      courseId: string;
      actorId: string;
      action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'WITHDRAW';
      reason?: string | null;
      toStatus: CourseStatus;
   },
) =>
   tx.courseReviewRecord.create({
      data: {
         courseId: options.courseId,
         actorId: options.actorId,
         action: options.action,
         reason: options.reason ?? null,
         toStatus: options.toStatus,
      },
   });

/** 课程编排专题，专题归属随编排变化 */
const assignTopics = async (
   tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
   courseId: string,
   topicIds: string[],
) => {
   if (topicIds.length === 0) return;
   const found = await tx.topic.count({ where: { id: { in: topicIds } } });
   if (found !== topicIds.length) throw badRequest('编排的专题里有不存在的专题');
   await tx.topic.updateMany({
      where: { id: { in: topicIds } },
      data: { courseId },
   });
};

export const createCourse = async (authorId: string, input: CourseInput) => {
   return prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
         data: {
            authorId,
            name: input.name,
            description: input.description,
            coverPreset: input.coverPreset,
            status: 'DRAFT',
            // 专题编排顺序只存在课程上
            topicIds: input.topicIds,
         },
         select: courseDetail,
      });
      await assignTopics(tx, course.id, input.topicIds);
      return course;
   });
};

export const updateCourse = async (id: string, input: CourseInput) => {
   const current = await prisma.course.findUnique({
      where: { id },
      select: { id: true, status: true },
   });
   if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: '没有这门课程' });
   if (current.status === 'PENDING') {
      throw conflict(
         '课程正在审核中，不能编辑',
         '要改内容先撤回审核（withdraw），改完重新提交',
      );
   }

   return prisma.$transaction(async (tx) => {
      const course = await tx.course.update({
         where: { id },
         data: {
            name: input.name,
            description: input.description,
            coverPreset: input.coverPreset,
            // 专题编排顺序只存在课程上
            topicIds: input.topicIds,
         },
         select: courseDetail,
      });
      await assignTopics(tx, id, input.topicIds);
      return course;
   });
};

export const deleteCourse = async (id: string) => {
   const topicCount = await prisma.topic.count({ where: { courseId: id } });
   if (topicCount > 0) {
      throw conflict(
         `这门课程下还有 ${topicCount} 个专题，不能删除`,
         '先把专题移到别的课程或删除专题（归属关系不允许级联删除）',
      );
   }
   await prisma.course.delete({ where: { id } });
   return { id };
};

const assertCoursePublishable = async (courseId: string) => {
   const topicCount = await prisma.topic.count({ where: { courseId } });
   if (topicCount === 0) {
      throw badRequest('课程至少要编排 1 个专题才能提交或上架');
   }
};

/** 作者提交审核：DRAFT → PENDING */
export const submitCourse = async (courseId: string, actorId: string) => {
   const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true },
   });
   if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: '没有这门课程' });
   if (course.status === 'PENDING') {
      throw conflict('课程已经在审核中', '等审核结果，或撤回后再提交');
   }
   await assertCoursePublishable(courseId);

   return prisma.$transaction(async (tx) => {
      const updated = await tx.course.update({
         where: { id: courseId },
         data: { status: 'PENDING' },
         select: courseDetail,
      });
      await writeReviewRecord(tx, {
         courseId,
         actorId,
         action: 'SUBMIT',
         toStatus: 'PENDING',
      });
      return updated;
   });
};

/** 作者撤回：PENDING → DRAFT */
export const withdrawCourse = async (courseId: string, actorId: string) => {
   const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true },
   });
   if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: '没有这门课程' });
   if (course.status !== 'PENDING') {
      throw conflict('只有审核中的课程可以撤回', '当前状态：' + course.status);
   }

   return prisma.$transaction(async (tx) => {
      const updated = await tx.course.update({
         where: { id: courseId },
         data: { status: 'DRAFT' },
         select: courseDetail,
      });
      await writeReviewRecord(tx, {
         courseId,
         actorId,
         action: 'WITHDRAW',
         toStatus: 'DRAFT',
      });
      return updated;
   });
};

/** 审核：通过转 PUBLISHED，驳回转 DRAFT 并记录理由 */
export const reviewCourse = async (options: {
   courseId: string;
   reviewerId: string;
   approve: boolean;
   reason?: string | null;
}) => {
   const { courseId, reviewerId, approve, reason } = options;
   const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true, authorId: true, name: true },
   });
   if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: '没有这门课程' });
   if (course.status !== 'PENDING') {
      throw conflict(
         '只有审核中的课程可以审核',
         `《${course.name}》当前状态：${course.status}`,
      );
   }
   if (course.authorId === reviewerId) {
      throw new TRPCError({
         code: 'FORBIDDEN',
         message: '不能审核自己提交的课程，请让另一位管理员处理',
      });
   }
   if (approve) await assertCoursePublishable(courseId);
   if (!approve && !reason?.trim()) {
      throw badRequest('驳回必须写明理由，作者要靠它知道怎么改');
   }

   const toStatus: CourseStatus = approve ? 'PUBLISHED' : 'DRAFT';
   return prisma.$transaction(async (tx) => {
      const updated = await tx.course.update({
         where: { id: courseId },
         data: { status: toStatus, reviewedAt: new Date() },
         select: courseDetail,
      });
      await writeReviewRecord(tx, {
         courseId,
         actorId: reviewerId,
         action: approve ? 'APPROVE' : 'REJECT',
         reason: reason ?? null,
         toStatus,
      });
      return updated;
   });
};

export { findPublishedCourse };
