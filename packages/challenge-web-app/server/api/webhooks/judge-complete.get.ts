import prisma from '~~/lib/prisma';
import z from 'zod';
import { rankService } from '~~/server/trpc/services/rank';
import { logger } from '~~/lib/logger';
import { notificationService } from '~~/server/trpc/services/notificatoin';
import { observer } from '~~/server/trpc/services/achievement';
import type { ValidPath } from '~~/lib/track-wrapper';

const JudgeCompleteSchema = z.object({
   recordId: z
      .string()
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val > 0, {
         message: 'recordId must be a positive integer',
      }),
});

export default defineEventHandler(async (event) => {
   const query = getQuery(event);
   const traceId = getHeader(event, 'x-trace-id') || 'unknown';
   const parseResult = JudgeCompleteSchema.safeParse(query);
   if (!parseResult.success) {
      logger.error(
         { query, traceId, error: parseResult.error },
         'Judge complete failed',
      );
      throw createError({
         statusCode: 400,
         message: 'Invalid request: ' + parseResult.error.message,
      });
   }

   const { recordId } = parseResult.data;

   const { problem, score, result, userId } = await prisma.judgeRecords
      .findUniqueOrThrow({
         where: { id: recordId },
         select: {
            problem: {
               select: {
                  pid: true,
                  baseId: true,
               },
            },
            userId: true,
            score: true,
            result: true,
         },
      })
      .catch((error) => {
         logger.error(
            { recordId, traceId, error },
            'Database query failed for judge complete',
         );
         throw createError({
            statusCode: 500,
            message: 'Internal server error',
         });
      });

   // 分数与统计一律按权威公式整表重算（见 rank.ts 中 recalculateUserStatistics 的说明）。 原实现用"历史最高分 - 本次得分"当增量，而 webhook 是在记录已入库后才被调用， 那个 MAX 必然包含本次得分，于是增量恒为 0、仪表盘分数永远是 0。
   if (result === 'success') {
      await rankService.pushToProblemRankings(problem.pid, recordId, score);
   }

   const { score: totalScore } = await rankService.recalculateUserStatistics(userId);

   // 排行榜分数写绝对值（不是增量）：数据库是唯一事实来源，
   // 用增量会在"缓存被清后重载再累加"的场景里重复计分。
   await rankService.setUserGlobalRankingScore(userId, totalScore);

   // 抓一次"今日排名快照"，供仪表盘的排名变化（getMyRankingTrends）使用。 必须吞掉这里的异常：快照只是展示用的附属数据， 绝不能因为它的写入失败而让判题结果的处理（分数、排行榜、通知）整体失败。
   await rankService.captureRankingSnapshot().catch((err) => {
      logger.warn(
         { err, userId },
         'Failed to capture ranking snapshot (不影响判题结果)',
      );
   });

   await notificationService.sendNotification({
      type: 'JUDGE',
      title: '判题完成通知',
      content: `您的提交（记录 ID: ${recordId}）已判题完成，结果：${result}，得分：${score} 分。`,
      userId: userId,
   });

   /** 触发成就判定：判题结果由调度器直接写库，Web 端观察者看不到，须显式把 judge_records 标脏；并通过 injectVars 带 userId（webhook 无 tRPC 上下文）。 */
    */
   observer.manualMarkDirty(['judge_records'] as ValidPath[], { userId });

   logger.info(
      {
         recordId,
         userId,
         problemId: problem.pid,
         score,
         result,
         traceId,
         totalScore,
      },
      'Judge complete success',
   );

   return { message: 'ok' };
});
