import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import prisma from '~~/lib/prisma';
import { logger } from '../utils/logger';
import { assertJudgeQuality, reviewJudgeQuality, type QualityAuditPayload } from './judge-quality';

/** Dedicated queue: long model requests must not block notifications or scheduled publishing. */
export function startJudgeQualityWorker() {
   let busy = false;
   let stopped = false;

   async function poll() {
      if (busy || stopped) return;
      busy = true;

      try {
         // Recover a job whose process died. The model request is limited to 120 seconds.
         await prisma.problemQualityReview.updateMany({
            where: {
               taskStatus: 'running',
               claimedAt: { lt: new Date(Date.now() - 5 * 60_000) },
            },
            data: { taskStatus: 'pending' },
         });

         const rows = await prisma.$queryRaw<{ id: string; problemId: number }[]>`
            UPDATE "problem_quality_reviews" SET "taskStatus" = 'running', "claimedAt" = now() AT TIME ZONE 'utc'
            WHERE "id" IN (
               SELECT "id" FROM "problem_quality_reviews" WHERE "taskStatus" = 'pending'
               ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED
            ) RETURNING "id", "problemId"
         `;

         for (const row of rows) {
            const record = await prisma.problemQualityReview.findUniqueOrThrow({ where: { id: row.id } });
            const payload = record.taskPayload as QualityAuditPayload | null;

            try {
               if (!payload) throw new Error('QUALITY_AUDIT_PAYLOAD_MISSING');
               await reviewJudgeQuality(row.problemId, row.id);

               await assertJudgeQuality(row.problemId);
               const { judgeServerUrl, ...task } = payload;
               const response = await fetch(`${judgeServerUrl}/task/create`, {
                  method: 'POST',
                  headers: {
                     'Content-Type': 'application/json',
                     'x-trace-id': payload.traceId,
                  },
                  body: JSON.stringify({ ...task, mode: 'audit' }),
                  signal: AbortSignal.timeout(15_000),
               });
               if (!response.ok) throw new Error('AUDIT_DISPATCH_FAILED');

               await prisma.problemQualityReview.update({
                  where: { id: row.id },
                  data: { taskStatus: 'done', taskPayload: Prisma.DbNull },
               });
            } catch (error) {
               // Do not log SDK errors, request bodies, reference files, or credentials.
               const errorCode = error instanceof TRPCError ? 'QUALITY_REVIEW_BLOCKED' : 'QUALITY_TASK_FAILED';
               await prisma.problemQualityReview.update({
                  where: { id: row.id },
                  data: { taskStatus: 'error', taskPayload: Prisma.DbNull },
               });
               await prisma.problemQualityReview.updateMany({
                  where: { id: row.id, status: { in: ['pending', 'running', 'passed'] } },
                  data: { status: 'error', errorCode, completedAt: new Date() },
               });

               // An audit that was never dispatched must not stay pending forever.
               if (payload) {
                  await prisma.$transaction([
                     prisma.problems.update({ where: { pid: row.problemId }, data: { status: 'invalid' } }),
                     prisma.judgeRecords.update({
                        where: { id: payload.judgeRecordId },
                        data: {
                           result: 'failed',
                           info: { errorMessage: 'AI 质量审核或判题投递未完成，请查看质量报告后重新提交。' },
                        },
                     }),
                  ]);
               }
               logger.warn({ reviewId: row.id, errorCode }, 'AI 质量审核任务未完成');
            }
         }
      } catch {
         logger.error('AI 质量审核队列暂时不可用');
      } finally {
         busy = false;
      }
   }

   const interval = setInterval(() => { void poll(); }, 2000);
   interval.unref?.();
   void poll();

   return () => {
      stopped = true;
      clearInterval(interval);
   };
}
