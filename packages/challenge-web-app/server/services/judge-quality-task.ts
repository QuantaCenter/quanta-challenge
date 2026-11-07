import { TRPCError } from '@trpc/server';
import prisma from '~~/lib/prisma';
import { logger } from '../utils/logger';
import { registerTimerHandler, withTimerTaskLease, type TimerTaskSnapshot } from '../utils/timer';
import { assertJudgeQuality, reviewJudgeQuality, type QualityAuditPayload } from './judge-quality';

type JudgeQualityTask = QualityAuditPayload & { reviewId: string };

async function markAuditFailed(payload: JudgeQualityTask, task: TimerTaskSnapshot) {
   await withTimerTaskLease(task, async (tx) => {
      const result = await tx.judgeRecords.updateMany({
         where: { id: payload.judgeRecordId, result: 'pending' },
         data: {
            result: 'failed',
            info: { errorMessage: 'AI 质量审核或判题投递未完成，请查看质量报告后重新提交。' },
         },
      });
      if (result.count) {
         await tx.problemQualityReview.updateMany({
            where: { id: payload.reviewId, status: { in: ['pending', 'running', 'passed'] } },
            data: { status: 'error', errorCode: 'QUALITY_TASK_FAILED', completedAt: new Date() },
         });
         await tx.problems.updateMany({
            where: { pid: payload.problemId, status: 'draft' },
            data: { status: 'invalid' },
         });
      }
   });
}

export function registerJudgeQualityHandler() {
   registerTimerHandler<JudgeQualityTask>('judge-quality', async (payload, task) => {
      try {
         const review = await prisma.problemQualityReview.findUnique({
            where: { id: payload.reviewId },
         });
         // The problem (and its review) may have been deleted while the task waited.
         if (!review) return;
         if (['rejected', 'needs_review', 'stale', 'error'].includes(review.status)) {
            await markAuditFailed(payload, task);
            return;
         }

         await reviewJudgeQuality(payload.problemId, payload.reviewId, task);
         await withTimerTaskLease(task, tx => assertJudgeQuality(payload.problemId, tx));

         const { judgeServerUrl, reviewId: _reviewId, ...judgeTask } = payload;
         const response = await fetch(`${judgeServerUrl}/task/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-trace-id': payload.traceId },
            body: JSON.stringify({ ...judgeTask, mode: 'audit' }),
            signal: AbortSignal.timeout(15_000),
         });
         if (!response.ok) {
            throw Object.assign(new Error('AUDIT_DISPATCH_FAILED'), { statusCode: response.status });
         }
      } catch (error) {
         if (error instanceof Error && error.message === 'TIMER_LEASE_LOST') throw error;
         const reviewExists = await prisma.problemQualityReview.findUnique({
            where: { id: payload.reviewId },
            select: { id: true },
         });
         if (!reviewExists) return;
         const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
         const permanentlyRejected = typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500 &&
            statusCode !== 408 && statusCode !== 429;
         const invalidScript = error instanceof Error && error.message === 'QUALITY_SCRIPT_COUNT';
         // After an ambiguous earlier attempt, even a later 4xx cannot prove that
         // the first request was not queued. Keep retrying the same idempotent job.
         if (!(error instanceof TRPCError) && !invalidScript && (!permanentlyRejected || task.attempts > 1)) {
            throw new Error('QUALITY_TASK_RETRY');
         }

         await markAuditFailed(payload, task);
         logger.warn({ reviewId: payload.reviewId }, 'AI 质量审核或判题投递未完成');
      }
   });
}
