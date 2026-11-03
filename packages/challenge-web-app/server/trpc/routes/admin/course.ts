import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import {
   adminCourseDetailSelect,
   collectPublishIssues,
   compactPositions,
   nextPosition,
   purgeSections,
   swapImageRef,
   swapWithNeighbor,
   touchCourse,
} from '../../services/course-admin';

const idInput = z.object({ id: z.string().min(1) });

const courseFields = {
   title: z.string().trim().min(1, '课程标题不能为空').max(50, '课程标题不能超过 50 字'),
   summary: z.string().trim().max(120, '课程简介不能超过 120 字'),
   description: z.string().max(50000, '课程导读过长'),
};

const chapterFields = {
   title: z.string().trim().min(1, '章节标题不能为空').max(50, '章节标题不能超过 50 字'),
   introduction: z.string().max(50000, '章节导读过长').default(''),
};

const sectionFields = {
   title: z.string().trim().min(1, '小节标题不能为空').max(60, '小节标题不能超过 60 字'),
   type: z.enum(['article', 'problem']),
   articleContent: z.string().max(200000, '正文过长').default(''),
   /** 题目节关联的题目 pid（problems.pid），保存时换算成 baseProblemId */
   problemPid: z.number().int().positive().nullish(),
};

const notFound = (message: string) => new TRPCError({ code: 'NOT_FOUND', message });

/**
 * 把选中的题目 pid 解析为题目族 id；文章节返回 null。
 * 数据库约束要求题目节必须关联题目（course_sections_content_check）。
 */
async function resolveBaseProblemId(type: 'article' | 'problem', problemPid?: number | null) {
   if (type !== 'problem') return null;
   if (!problemPid) throw new TRPCError({ code: 'BAD_REQUEST', message: '实践题小节需要关联一道题目' });
   const problem = await prisma.problems.findUnique({
      where: { pid: problemPid },
      select: { baseId: true },
   });
   if (!problem) throw notFound('关联的题目不存在');
   return problem.baseId;
}

async function loadCourseDetail(id: string) {
   const course = await prisma.course.findUnique({ where: { id }, select: adminCourseDetailSelect });
   if (!course) throw notFound('课程不存在');
   return course;
}

export const courseAdminRouter = router({
   list: protectedAdminProcedure.query(async () => {
      const courses = await prisma.course.findMany({
         orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
         select: {
            id: true,
            title: true,
            summary: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            coverImage: { select: { name: true } },
            _count: { select: { chapters: true, enrollments: true } },
            chapters: {
               select: { stages: { select: { _count: { select: { sections: true } } } } },
            },
         },
      });
      return courses.map(({ chapters, _count, ...course }) => ({
         ...course,
         chapterCount: _count.chapters,
         enrollmentCount: _count.enrollments,
         sectionCount: chapters.reduce(
            (total, chapter) => total + chapter.stages.reduce((sum, stage) => sum + stage._count.sections, 0),
            0,
         ),
      }));
   }),

   get: protectedAdminProcedure.input(idInput).query(async ({ input }) => {
      const course = await loadCourseDetail(input.id);
      return { ...course, issues: collectPublishIssues(course) };
   }),

   create: protectedAdminProcedure
      .input(
         z.object({
            ...courseFields,
            coverImageId: z.string().min(1).nullish(),
         }),
      )
      .mutation(async ({ input }) => {
         return prisma.$transaction(async (tx) => {
            const course = await tx.course.create({
               data: {
                  title: input.title,
                  summary: input.summary,
                  description: input.description,
                  coverImageId: input.coverImageId || null,
               },
               select: { id: true },
            });
            await swapImageRef(tx, null, input.coverImageId);
            return course;
         });
      }),

   update: protectedAdminProcedure
      .input(
         z.object({
            id: z.string().min(1),
            ...courseFields,
            coverImageId: z.string().min(1).nullable(),
         }),
      )
      .mutation(async ({ input }) => {
         return prisma.$transaction(async (tx) => {
            const previous = await tx.course.findUnique({
               where: { id: input.id },
               select: { coverImageId: true },
            });
            if (!previous) throw notFound('课程不存在');
            await tx.course.update({
               where: { id: input.id },
               data: {
                  title: input.title,
                  summary: input.summary,
                  description: input.description,
                  coverImageId: input.coverImageId,
               },
            });
            await swapImageRef(tx, previous.coverImageId, input.coverImageId);
            return { id: input.id };
         });
      }),

   setStatus: protectedAdminProcedure
      .input(z.object({ id: z.string().min(1), publish: z.boolean() }))
      .mutation(async ({ input }) => {
         if (input.publish) {
            const issues = collectPublishIssues(await loadCourseDetail(input.id));
            if (issues.length) {
               throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: `还有 ${issues.length} 项待完善：${issues[0]!.message}`,
               });
            }
         }
         const course = await prisma.course.update({
            where: { id: input.id },
            data: { status: input.publish ? 'published' : 'unpublished' },
            select: { id: true, status: true },
         });
         return course;
      }),

   remove: protectedAdminProcedure.input(idInput).mutation(async ({ input }) => {
      await prisma.$transaction(async (tx) => {
         const course = await tx.course.findUnique({
            where: { id: input.id },
            select: { coverImageId: true },
         });
         if (!course) throw notFound('课程不存在');
         await purgeSections(tx, { stage: { chapter: { courseId: input.id } } });
         await tx.learningStage.deleteMany({ where: { chapter: { courseId: input.id } } });
         await tx.courseChapter.deleteMany({ where: { courseId: input.id } });
         // 选课记录删除时，评分与剩余进度随之级联删除
         await tx.courseEnrollment.deleteMany({ where: { courseId: input.id } });
         await tx.course.delete({ where: { id: input.id } });
         await swapImageRef(tx, course.coverImageId, null);
      });
      return { id: input.id };
   }),

   /** 统一的上移 / 下移：章节、阶段、小节都只在同级内调整顺序。 */
   move: protectedAdminProcedure
      .input(
         z.object({
            kind: z.enum(['chapter', 'stage', 'section']),
            id: z.string().min(1),
            direction: z.enum(['up', 'down']),
            courseId: z.string().min(1),
         }),
      )
      .mutation(async ({ input }) => {
         return prisma.$transaction(async (tx) => {
            const moved = await swapWithNeighbor(tx, input.kind, input.id, input.direction);
            if (moved) await touchCourse(tx, input.courseId);
            return { moved };
         });
      }),

   createChapter: protectedAdminProcedure
      .input(z.object({ courseId: z.string().min(1), ...chapterFields }))
      .mutation(async ({ input }) => {
         return prisma.$transaction(async (tx) => {
            const course = await tx.course.findUnique({ where: { id: input.courseId }, select: { id: true } });
            if (!course) throw notFound('课程不存在');
            const chapter = await tx.courseChapter.create({
               data: {
                  courseId: input.courseId,
                  title: input.title,
                  introduction: input.introduction,
                  position: await nextPosition(tx, 'chapter', input.courseId),
                  // 新章节自带第一个阶段，直接就能往里加小节
                  stages: { create: { position: 1 } },
               },
               select: { id: true },
            });
            await touchCourse(tx, input.courseId);
            return chapter;
         });
      }),

   updateChapter: protectedAdminProcedure
      .input(z.object({ id: z.string().min(1), ...chapterFields }))
      .mutation(async ({ input }) => {
         return prisma.$transaction(async (tx) => {
            const chapter = await tx.courseChapter.update({
               where: { id: input.id },
               data: { title: input.title, introduction: input.introduction },
               select: { id: true, courseId: true },
            });
            await touchCourse(tx, chapter.courseId);
            return { id: chapter.id };
         });
      }),

   removeChapter: protectedAdminProcedure.input(idInput).mutation(async ({ input }) => {
      return prisma.$transaction(async (tx) => {
         const chapter = await tx.courseChapter.findUnique({
            where: { id: input.id },
            select: { courseId: true },
         });
         if (!chapter) throw notFound('章节不存在');
         await purgeSections(tx, { stage: { chapterId: input.id } });
         await tx.learningStage.deleteMany({ where: { chapterId: input.id } });
         await tx.courseChapter.delete({ where: { id: input.id } });
         await compactPositions(tx, 'chapter', chapter.courseId);
         await touchCourse(tx, chapter.courseId);
         return { id: input.id };
      });
   }),

   createStage: protectedAdminProcedure
      .input(z.object({ chapterId: z.string().min(1) }))
      .mutation(async ({ input }) => {
         return prisma.$transaction(async (tx) => {
            const chapter = await tx.courseChapter.findUnique({
               where: { id: input.chapterId },
               select: { courseId: true },
            });
            if (!chapter) throw notFound('章节不存在');
            const stage = await tx.learningStage.create({
               data: {
                  chapterId: input.chapterId,
                  position: await nextPosition(tx, 'stage', input.chapterId),
               },
               select: { id: true },
            });
            await touchCourse(tx, chapter.courseId);
            return stage;
         });
      }),

   removeStage: protectedAdminProcedure.input(idInput).mutation(async ({ input }) => {
      return prisma.$transaction(async (tx) => {
         const stage = await tx.learningStage.findUnique({
            where: { id: input.id },
            select: { chapterId: true, chapter: { select: { courseId: true } } },
         });
         if (!stage) throw notFound('阶段不存在');
         await purgeSections(tx, { stageId: input.id });
         await tx.learningStage.delete({ where: { id: input.id } });
         await compactPositions(tx, 'stage', stage.chapterId);
         await touchCourse(tx, stage.chapter.courseId);
         return { id: input.id };
      });
   }),

   createSection: protectedAdminProcedure
      .input(z.object({ stageId: z.string().min(1), ...sectionFields }))
      .mutation(async ({ input }) => {
         const baseProblemId = await resolveBaseProblemId(input.type, input.problemPid);
         return prisma.$transaction(async (tx) => {
            const stage = await tx.learningStage.findUnique({
               where: { id: input.stageId },
               select: { chapter: { select: { courseId: true } } },
            });
            if (!stage) throw notFound('阶段不存在');
            const section = await tx.courseSection.create({
               data: {
                  stageId: input.stageId,
                  title: input.title,
                  type: input.type,
                  position: await nextPosition(tx, 'section', input.stageId),
                  articleContent: input.type === 'article' ? input.articleContent : null,
                  baseProblemId,
               },
               select: { id: true },
            });
            await touchCourse(tx, stage.chapter.courseId);
            return section;
         });
      }),

   updateSection: protectedAdminProcedure
      .input(z.object({ id: z.string().min(1), ...sectionFields }))
      .mutation(async ({ input }) => {
         const baseProblemId = await resolveBaseProblemId(input.type, input.problemPid);
         return prisma.$transaction(async (tx) => {
            const previous = await tx.courseSection.findUnique({
               where: { id: input.id },
               select: {
                  type: true,
                  articleContent: true,
                  stage: { select: { chapter: { select: { courseId: true } } } },
               },
            });
            if (!previous) throw notFound('小节不存在');
            const articleContent = input.type === 'article' ? input.articleContent : null;
            // 正文或类型变化时递增版本，评论引用据此判断是否需要重新定位
            const contentChanged = previous.type !== input.type || previous.articleContent !== articleContent;
            await tx.courseSection.update({
               where: { id: input.id },
               data: {
                  title: input.title,
                  type: input.type,
                  articleContent,
                  baseProblemId,
                  ...(contentChanged ? { contentVersion: { increment: 1 } } : {}),
               },
            });
            await touchCourse(tx, previous.stage.chapter.courseId);
            return { id: input.id };
         });
      }),

   removeSection: protectedAdminProcedure.input(idInput).mutation(async ({ input }) => {
      return prisma.$transaction(async (tx) => {
         const section = await tx.courseSection.findUnique({
            where: { id: input.id },
            select: { stageId: true, stage: { select: { chapter: { select: { courseId: true } } } } },
         });
         if (!section) throw notFound('小节不存在');
         await purgeSections(tx, { id: input.id });
         await compactPositions(tx, 'section', section.stageId);
         await touchCourse(tx, section.stage.chapter.courseId);
         return { id: input.id };
      });
   }),
});
