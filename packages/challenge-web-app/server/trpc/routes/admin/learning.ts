import z from 'zod';
import prisma from '~~/lib/prisma';
import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import {
   listAllTopics,
   listArticles,
   listPublishedTopics,
} from '../../services/learning-read';
import {
   createArticle,
   createCourse,
   createTopic,
   deleteArticle,
   deleteCourse,
   deleteTopic,
   reviewCourse,
   submitCourse,
   updateArticle,
   updateCourse,
   updateTopic,
   withdrawCourse,
} from '../../services/learning-write';

/**
 * 学习内容的创作侧接口（ADMIN 起）。
 *
 * 与 `public.learning.*` 的区别：这里能看草稿 / 待审，
 * 并且写入时会按 §17 的产品规则校验（题号必须已发布、
 * 有待审的课程不能改、有引用的东西不能删……）。
 */
const articleInput = z.object({
   title: z.string().min(1, '标题不能为空').max(80),
   slug: z
      .string()
      .min(1, '英文标识不能为空')
      .max(80)
      .regex(/^[a-z0-9-]+$/, '英文标识只能用小写字母、数字与连字符'),
   summary: z.string().max(160).default(''),
   source: z.string().min(1, '正文不能为空'),
   coverPreset: z.string().min(1).default('slate'),
   coverUrl: z.string().nullish(),
});

const topicInput = z.object({
   courseId: z.string().min(1, '必须选择归属课程'),
   name: z.string().min(1, '专题名称不能为空').max(40),
   slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/),
   description: z.string().max(200).default(''),
   weight: z.number().int().min(0).max(9999).default(10),
   coverPreset: z.string().min(1).default('slate'),
   articleIds: z.array(z.string()).default([]),
   prerequisites: z.array(z.string()).default([]),
});

const courseInput = z.object({
   name: z.string().min(1, '课程名称不能为空').max(40),
   slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/),
   description: z.string().max(200).default(''),
   weight: z.number().int().min(0).max(9999).default(10),
   coverPreset: z.string().min(1).default('slate'),
   topicIds: z.array(z.string()).default([]),
});

const IdSchema = z.object({ id: z.string().min(1) });

export const learningAdminRouter = router({
   /* ---------- 创作侧读取（含草稿 / 待审） ---------- */

   articles: protectedAdminProcedure.query(async () => listArticles()),

   /** 全部课程（含草稿与待审），创作侧列表用 */
   courses: protectedAdminProcedure.query(async () =>
      prisma.course.findMany({
         orderBy: [{ weight: 'asc' }, { id: 'asc' }],
         select: {
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
         },
      }),
   ),

   /** 全部专题（含待审课程下的），创作侧选择器用 */
   topics: protectedAdminProcedure.query(async () => listAllTopics()),

   /** 课程审核历史（谁在什么时候提交 / 通过 / 驳回，理由是什么） */
   courseReviews: protectedAdminProcedure
      .input(z.object({ courseId: z.string().min(1) }))
      .query(async ({ input }) =>
         prisma.courseReviewRecord.findMany({
            where: { courseId: input.courseId },
            orderBy: { createdAt: 'desc' },
            select: {
               id: true,
               action: true,
               reason: true,
               toStatus: true,
               createdAt: true,
               Actor: { select: { id: true, name: true, displayName: true } },
            },
         }),
      ),

   /* ---------- 文章 ---------- */

   createArticle: protectedAdminProcedure
      .input(articleInput)
      .mutation(async ({ ctx, input }) => createArticle(ctx.user.userId, input)),

   updateArticle: protectedAdminProcedure
      .input(articleInput.extend({ id: z.string().min(1) }))
      .mutation(async ({ input }) => {
         const { id, ...rest } = input;
         return updateArticle(id, rest);
      }),

   deleteArticle: protectedAdminProcedure
      .input(IdSchema)
      .mutation(async ({ input }) => deleteArticle(input.id)),

   /* ---------- 专题 ---------- */

   createTopic: protectedAdminProcedure
      .input(topicInput)
      .mutation(async ({ ctx, input }) => createTopic(ctx.user.userId, input)),

   updateTopic: protectedAdminProcedure
      .input(topicInput.extend({ id: z.string().min(1) }))
      .mutation(async ({ input }) => {
         const { id, ...rest } = input;
         return updateTopic(id, rest);
      }),

   deleteTopic: protectedAdminProcedure
      .input(IdSchema)
      .mutation(async ({ input }) => deleteTopic(input.id)),

   /* ---------- 课程 + 审核 ---------- */

   createCourse: protectedAdminProcedure
      .input(courseInput)
      .mutation(async ({ ctx, input }) => createCourse(ctx.user.userId, input)),

   updateCourse: protectedAdminProcedure
      .input(courseInput.extend({ id: z.string().min(1) }))
      .mutation(async ({ input }) => {
         const { id, ...rest } = input;
         return updateCourse(id, rest);
      }),

   deleteCourse: protectedAdminProcedure
      .input(IdSchema)
      .mutation(async ({ input }) => deleteCourse(input.id)),

   submitCourse: protectedAdminProcedure
      .input(IdSchema)
      .mutation(async ({ ctx, input }) => submitCourse(input.id, ctx.user.userId)),

   withdrawCourse: protectedAdminProcedure
      .input(IdSchema)
      .mutation(async ({ ctx, input }) =>
         withdrawCourse(input.id, ctx.user.userId),
      ),

   reviewCourse: protectedAdminProcedure
      .input(
         z.object({
            id: z.string().min(1),
            approve: z.boolean(),
            reason: z.string().max(200).nullish(),
         }),
      )
      .mutation(async ({ ctx, input }) =>
         reviewCourse({
            courseId: input.id,
            reviewerId: ctx.user.userId,
            approve: input.approve,
            reason: input.reason,
         }),
      ),

   /** 待审核课程列表（管理页用） */
   pendingCourses: protectedAdminProcedure.query(async () =>
      prisma.course.findMany({
         where: { status: 'PENDING' },
         orderBy: { updatedAt: 'asc' },
         select: {
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
            Author: { select: { id: true, name: true, displayName: true } },
         },
      }),
   ),

   /** 学习侧「可见专题」的复用出口：创作侧的专题选择器不区分状态，这里不暴露 */
   publishedTopics: protectedAdminProcedure.query(async () =>
      listPublishedTopics(),
   ),
});
