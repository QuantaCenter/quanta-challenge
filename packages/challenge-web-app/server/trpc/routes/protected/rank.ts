import z from 'zod';
import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import prisma from '~~/lib/prisma';
import { rankService } from '../../services/rank';

const GetMyRankInProblemSchema = z.object({
   recordId: z.number('Record ID must be a number'),
});

const getMyRankInProblemProcedure = protectedProcedure
   .input(GetMyRankInProblemSchema)
   .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { recordId } = input;

      // 确保存在有得分的提交记录
      const { problemId } = await prisma.judgeRecords.findUniqueOrThrow({
         where: {
            id: recordId,
            userId,
            score: { gt: 0 },
         },
         select: {
            problemId: true,
         },
      });

      return await rankService.getSelfProblemRanking(problemId, recordId);
   });

const GetProblemScoreIntervalsSchema = z.object({
   problemId: z.number('Problem ID must be a number'),
});

const getProblemScoreIntervalsProcedure = protectedProcedure
   .input(GetProblemScoreIntervalsSchema)
   .query(async ({ input }) => {
      const { problemId } = input;
      return await rankService.getProblemRankingIntervals(problemId, 16);
   });

const getMyGlobalRankStatisticProcedure = protectedProcedure.query(
   async ({ ctx }) => {
      const { userId } = ctx.user;

      const [selfRanking, rankingIntervals] = await Promise.all([
         rankService.getSelfGlobalRanking(userId),
         rankService.getGlobalRankingIntervals(8),
      ]);

      return {
         selfRanking,
         rankingIntervals,
      };
   }
);

const getMyGlobalRankProcedure = protectedProcedure.query(async ({ ctx }) => {
   const { userId } = ctx.user;
   return (await rankService.getSelfGlobalRanking(userId)).rank;
});

const getMyRankingTrendsProcedure = protectedProcedure.query(
   async ({ ctx }) => {
      const { userId } = ctx.user;

      // 必须先按日期倒序取「最近」6 条，再翻转成由旧到新交给折线图。
      //
      // 原实现是 `orderBy: { date: 'asc' }` + `take: 6`，拿到的是**最早**的 6 天：
      // 历史超过 6 天的用户，曲线永远停在最初 6 天，之后的名次变化再也画不出来；
      // 下面的 `history.slice(-6)` 也因此成了死代码（history.length 恒 ≤ 6）。
      const history = (
         await prisma.rankingHistory.findMany({
            where: { userId },
            orderBy: { date: 'desc' },
            select: {
               rank: true,
            },
            take: 6,
         })
      ).reverse();

      let rankings: number[] = [];
      if (history.length < 6) {
         const fillCount = 6 - history.length;
         // 历史不足 6 天时的填充值。
         //
         // 原实现用 history[0]?.rank（即**最早**那条）填充，于是新用户（只有当天一条）
         // 会把当天的名次平铺成 6 个相同的值，曲线永远是一条水平线 ——
         // 看起来"排名从未变化"，即使当天其实刚发生过名次变动。
         // 对"6 天前还不存在"的用户来说，用当前名次做基线更诚实：曲线保持水平，
         // 而后续每天新增真实记录时会自然形成折线。
         const fillValue = history.at(-1)?.rank ?? history[0]?.rank ?? 0;
         rankings = Array(fillCount)
            .fill(fillValue)
            .concat(history.map((h) => h.rank));
      } else {
         rankings = history.slice(-6).map((h) => h.rank);
      }

      // 名次变化按「占全体名次的比例」展示，因此连同榜单总人数一并返回，
      // 避免前端再单独发一次请求（仪表盘与排行榜页都要用）。
      const { total } = await rankService.getSelfGlobalRanking(userId);

      return { trends: rankings, total };
   }
);

export const rankRouter = router({
   getMyRankInProblem: getMyRankInProblemProcedure,
   getProblemScoreIntervals: getProblemScoreIntervalsProcedure,
   getMyGlobalRankStatistic: getMyGlobalRankStatisticProcedure,
   getMyRankingTrends: getMyRankingTrendsProcedure,
   getMyGlobalRank: getMyGlobalRankProcedure,
});
