import prisma from '~~/lib/prisma';
import { dispatchPublishScheduledTask } from '~~/server/services/publish-scheduled-problem';
import z from 'zod';
import { getRequestContext } from '@challenge/shared/trace';
import { rankService } from '~~/server/trpc/services/rank';
import { logger } from '~~/server/utils/logger';
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
   const parseResult = JudgeCompleteSchema.safeParse(query);
   if (!parseResult.success) {
      logger.error(
         { query, error: parseResult.error },
         'Judge complete failed',
      );
      throw createError({
         statusCode: 400,
         message: 'Invalid request: ' + parseResult.error.message,
      });
   }

   const { recordId } = parseResult.data;

   const { problem, score, result, userId, type } = await prisma.judgeRecords
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
            type: true,
         },
      })
      .catch((error) => {
         logger.error(
            { recordId, error },
            'Database query failed for judge complete',
         );
         throw createError({
            statusCode: 500,
            message: 'Internal server error',
         });
      });

   // webhook 无登录态，判题记录归属用户即本请求的上下文用户，日志自动携带 quanta.user.id。
   const store = getRequestContext();
   if (store) store.userId = String(userId);

   if (type === 'judge') {
      await rankService.pushToProblemRankings(
         problem.pid,
         recordId,
         score,
         userId,
      );
   }

   const { score: totalScore } = await rankService.recalculateUserStatistics(userId);

   await rankService.setUserGlobalRankingScore(userId, totalScore);

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

   /* 触发成就判定。*/
   observer.manualMarkDirty(['judge_records'] as ValidPath[], { userId });

   // 审计通过后重新派发定时发布任务，内部校验状态与定时时间
   if (type === 'audit') {
      await dispatchPublishScheduledTask(problem.pid);
   }

   logger.info(
      {
         recordId,
         problemId: problem.pid,
         score,
         result,
         totalScore,
      },
      'Judge complete success',
   );

   return { message: 'ok' };
});
