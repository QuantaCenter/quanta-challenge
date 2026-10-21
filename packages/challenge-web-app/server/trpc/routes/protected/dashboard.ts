import prisma from '~~/lib/prisma';
import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import { rankService } from '../../services/rank';
import { problemStatService } from '../../services/problem-stat';

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
      const date = submission.createdAt.toISOString().split('T')[0];
      if (!statusCount[date]) {
         statusCount[date] = 0;
      }
      statusCount[date]++;
   });

   return statusCount;
});

export const dashboardRouter = router({
   getRecentSubmissions,
   getSubmissionStatus,
});
