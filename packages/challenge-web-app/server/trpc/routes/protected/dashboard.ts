import prisma from '~~/lib/prisma';
import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import { rankService } from '../../services/rank';
import { problemStatService } from '../../services/problem-stat';
import { selectRecentLearning } from '../../../utils/recent-learning';

const getRecentSubmissions = protectedProcedure.query(async ({ ctx }) => {
   const { userId } = ctx.user;

   const recentRecord = await prisma.judgeRecords.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
         id: true,
         result: true,
         judgingTime: true,
         pendingTime: true,
         score: true,
         problem: {
            select: {
               pid: true,
               title: true,
               baseId: true,
            },
         },
      },
   });
   if (!recentRecord) {
      return null;
   }

   const [recordId, problemId] = [recentRecord.id, recentRecord.problem.pid];
   const [rank, passRate] = await Promise.all([
      rankService.getSelfProblemRanking(problemId, recordId),
      problemStatService.getPassRate(recentRecord.problem.baseId),
   ]);

   return {
      judgingTime: recentRecord.judgingTime,
      pendingTime: recentRecord.pendingTime,
      score: recentRecord.score,
      result: recentRecord.result,
      title: recentRecord.problem.title,
      passRate: passRate,
      aheadRate: rank.aheadRate,
      recordId: recordId,
      problemId: problemId,
   };
});

const getSubmissionStatus = protectedProcedure.query(async ({ ctx }) => {
   const { userId } = ctx.user;

   const submissions = await prisma.judgeRecords.findMany({
      where: { userId, type: 'judge' },
      select: { createdAt: true },
   });

   const statusCount: Record<string, number> = {};
   submissions.forEach((submission) => {
      const date = submission.createdAt.toISOString().slice(0, 10);
      if (!statusCount[date]) {
         statusCount[date] = 0;
      }
      statusCount[date]++;
   });

   return statusCount;
});

const getRecentLearning = protectedProcedure.query(async ({ ctx }) => {
   const where = { userId: ctx.user.userId, course: { status: 'published' as const } };
   // 完成状态依赖当前课程的小节总数，必须在判断完成状态、排序后再限制条数。
   const enrollments = await prisma.courseEnrollment.findMany({
      where,
      select: {
         id: true,
         enrolledAt: true,
         // 章节被移动后，仅统计仍属于当前课程的小节进度。
         progress: {
            select: { completedAt: true, section: { select: { stage: { select: { chapter: { select: { courseId: true } } } } } } },
         },
         course: {
            select: {
               id: true,
               title: true,
               chapters: { select: { stages: { select: { _count: { select: { sections: true } } } } } },
            },
         },
      },
   });
   return selectRecentLearning(enrollments.map(({ course, progress, enrolledAt }) => {
      const currentProgress = progress.filter(item => item.section.stage.chapter.courseId === course.id);
      const total = course.chapters.reduce((count, chapter) => count + chapter.stages.reduce((sum, stage) => sum + stage._count.sections, 0), 0);
      const completed = currentProgress.length;
      return {
         id: course.id,
         title: course.title,
         total,
         completed,
         percent: total ? Math.floor(completed / total * 100) : 0,
         finished: total > 0 && completed === total,
         lastLearnedAt: new Date(Math.max(enrolledAt.getTime(), ...currentProgress.map(item => item.completedAt.getTime()))),
      };
   }));
});

export const dashboardRouter = router({
   getRecentSubmissions,
   getSubmissionStatus,
   getRecentLearning,
});
