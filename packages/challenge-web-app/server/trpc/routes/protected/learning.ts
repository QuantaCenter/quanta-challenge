import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import { loadLearningCourse, requireLearningSection } from '../../services/learning';

const sectionInput = z.object({ id: z.string().min(1), sectionId: z.string().min(1) });

const courseSelect = {
   id: true,
   title: true,
   summary: true,
   description: true,
   coverImage: { select: { name: true } },
   chapters: {
      orderBy: { position: 'asc' as const },
      select: {
         id: true,
         title: true,
         stages: {
            orderBy: { position: 'asc' as const },
            select: {
               _count: { select: { sections: true } },
               sections: {
                  orderBy: { position: 'asc' as const },
                  select: { id: true, title: true, type: true },
               },
            },
         },
      },
   },
} as const;

export const learningRouter = router({
   study: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(({ ctx, input }) => loadLearningCourse(ctx.user.userId, input.id)),
   section: protectedProcedure
      .input(sectionInput)
      .query(async ({ ctx, input }) => {
         await requireLearningSection(ctx.user.userId, input.id, input.sectionId);
         const section = await prisma.courseSection.findUniqueOrThrow({
            where: { id: input.sectionId },
            select: {
               id: true, title: true, type: true, articleContent: true,
               baseProblem: {
                  select: { CurrentProblem: { select: { pid: true, title: true, status: true } } },
               },
            },
         });
         const problem = section.baseProblem?.CurrentProblem;
         return {
            id: section.id,
            title: section.title,
            type: section.type,
            articleContent: section.type === 'article' ? section.articleContent : null,
            problem: problem?.status === 'published' ? { pid: problem.pid, title: problem.title } : null,
         };
      }),
   completeSection: protectedProcedure
      .input(sectionInput)
      .mutation(async ({ ctx, input }) => {
         const { course, section } = await requireLearningSection(ctx.user.userId, input.id, input.sectionId);
         if (section.completed) return { completed: true };
         let judgeRecordId: number | undefined;
         if (section.type === 'problem') {
            const problem = await prisma.courseSection.findUniqueOrThrow({
               where: { id: section.id },
               select: { baseProblem: { select: { currentPid: true } } },
            });
            const pid = problem.baseProblem?.currentPid;
            const record = pid ? await prisma.judgeRecords.findFirst({
               where: {
                  userId: ctx.user.userId, problemId: pid, result: 'success', type: 'judge',
                  createdAt: { gte: section.unlockedAt! },
               },
               select: { id: true },
               orderBy: { id: 'asc' },
            }) : null;
            if (!record) return { completed: false };
            judgeRecordId = record.id;
         }
         await prisma.sectionProgress.upsert({
            where: { enrollmentId_sectionId: { enrollmentId: course.enrollmentId, sectionId: section.id } },
            create: { enrollmentId: course.enrollmentId, sectionId: section.id, judgeRecordId },
            update: {},
         });
         return { completed: true };
      }),
   enroll: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
         return prisma.$transaction(async (tx) => {
            const course = await tx.course.findFirst({
               where: { id: input.id, status: 'published' },
               select: { id: true },
            });
            if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: '课程不存在或已下架' });
            await tx.courseEnrollment.upsert({
               where: { userId_courseId: { userId: ctx.user.userId, courseId: course.id } },
               create: { userId: ctx.user.userId, courseId: course.id },
               update: {},
            });
            return { enrolled: true as const };
         });
      }),
   list: protectedProcedure
      .input(z.object({ cursor: z.string().nullish(), limit: z.number().int().min(1).max(48).default(12) }))
      .query(async ({ ctx, input }) => {
         const courses = await prisma.course.findMany({
            where: { status: 'published' },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            cursor: input.cursor ? { id: input.cursor } : undefined,
            skip: input.cursor ? 1 : 0,
            take: input.limit + 1,
            select: { ...courseSelect, enrollments: { where: { userId: ctx.user.userId }, select: { id: true } } },
         });
         const hasMore = courses.length > input.limit;
         if (hasMore) courses.pop();
         return {
            courses: courses.map(({ enrollments, ...course }) => ({
               ...course,
               enrolled: enrollments.length > 0,
               // 初始估算：每篇文章 5 分钟，每道实践题 30 分钟。
               estimatedMinutes: course.chapters.reduce((total, chapter) =>
                  total + chapter.stages.reduce((sum, stage) =>
                     sum + stage.sections.reduce((minutes, section) =>
                        minutes + (section.type === 'article' ? 5 : 30), 0), 0), 0),
            })),
            nextCursor: hasMore ? courses.at(-1)?.id ?? null : null,
         };
      }),
   get: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
         const course = await prisma.course.findFirst({
            where: { id: input.id, status: 'published' },
            select: { ...courseSelect, enrollments: { where: { userId: ctx.user.userId }, select: { id: true } } },
         });
         if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: '课程不存在' });
         const { enrollments, ...details } = course;
         const [progress, recommendations] = await Promise.all([
            enrollments.length ? prisma.sectionProgress.findMany({
               where: { enrollment: { userId: ctx.user.userId, courseId: course.id } },
               select: { sectionId: true },
            }) : Promise.resolve([]),
            prisma.course.findMany({
               where: { status: 'published', id: { not: course.id } },
               orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
               take: 3,
               select: {
                  id: true,
                  title: true,
                  summary: true,
                  coverImage: { select: { name: true } },
               },
            }),
         ]);
         return {
            ...details,
            enrolled: enrollments.length > 0,
            completedSectionIds: progress.map(item => item.sectionId),
            recommendations,
         };
      }),
});
