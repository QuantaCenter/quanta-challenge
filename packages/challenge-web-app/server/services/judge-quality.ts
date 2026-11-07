import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import prisma from '~~/lib/prisma';
import { previousQualityFeedback, qualityHash, qualityPassed, validateQualityReport } from '../utils/judge-quality';
import { generateJudgeQuality } from '../utils/judge-quality-provider';
import { createReviewDiff } from '../utils/judge-quality-diff';
import { QualityGenerationError, type ReviewAttempt } from '../utils/judge-quality-retry';

type QualityDatabase = Pick<Prisma.TransactionClient, 'problems' | 'problemQualityReview'>;

async function snapshot(problemId: number, db: QualityDatabase = prisma) {
   const input = await db.problems.findUniqueOrThrow({
      where: { pid: problemId },
      select: {
         title: true,
         detail: true,
         totalScore: true,
         problemType: true,
         bootCommand: true,
         initCommand: true,
         buildCommand: true,
         judgeUploadPath: true,
         enableCloudFunction: true,
         serviceImage: true,
         servicePort: true,
         JudgeFile: { select: { judgeScript: true }, orderBy: { id: 'asc' } },
      },
   });
   if (input.JudgeFile.length !== 1) throw new Error('QUALITY_SCRIPT_COUNT');

   return { input, script: input.JudgeFile[0]!.judgeScript, hash: qualityHash(input) };
}

/** Recheck the exact content inside the same transaction that publishes it. */
export async function assertJudgeQuality(problemId: number, db: QualityDatabase = prisma) {
   const current = await snapshot(problemId, db);
   const review = await db.problemQualityReview.findFirst({
      where: { problemId, inputHash: current.hash },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
   });

   const passed = review?.status === 'passed' && qualityPassed(validateQualityReport(review.report));
   if (!passed && review?.status !== 'skipped') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '判题脚本尚未通过当前内容版本的 AI 质量审核，请重新提交审核。' });
   }
}

/** No code execution or tools are exposed to the model. Network errors never include SDK request details. */
export type QualityAuditPayload = {
   judgeServerUrl: string;
   traceId: string;
   userId: string;
   problemId: number;
   judgeRecordId: number;
   judgeScript: string;
   fsSnapshot?: Record<string, string>;
   skipQualityReview?: boolean;
};

export async function enqueueJudgeQuality(problemId: number, payload: QualityAuditPayload) {
   const current = await snapshot(problemId);
   if (current.script !== payload.judgeScript) throw new Error('QUALITY_SCRIPT_MISMATCH');
   return prisma.problemQualityReview.create({
      data: {
         problemId,
         inputHash: current.hash,
         model: useRuntimeConfig().llm.model,
         status: 'pending',
         taskStatus: 'pending',
         taskPayload: payload as Prisma.InputJsonValue,
      },
      select: { id: true },
   }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
         throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: '该版本已有 AI 审核任务，请等待完成。' });
      }
      throw error;
   });
}

export async function reviewJudgeQuality(problemId: number, queuedId: string) {
   const current = await snapshot(problemId);
   const review = await prisma.problemQualityReview.findUniqueOrThrow({ where: { id: queuedId } });

   if (review.problemId !== problemId || review.inputHash !== current.hash) {
      await prisma.problemQualityReview.update({ where: { id: review.id }, data: { status: 'stale', completedAt: new Date() } });
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '审核内容已变化，请重新提交。' });
   }
   await prisma.problemQualityReview.update({ where: { id: review.id }, data: { status: 'running', errorCode: null, completedAt: null } });
   const attempts: ReviewAttempt[] = [];

   try {
      const problem = await prisma.problems.findUniqueOrThrow({
         where: { pid: problemId },
         select: { baseId: true },
      });
      // Use the most recent decision from the same problem, made before this task was queued.
      const previousReview = await prisma.problemQualityReview.findFirst({
         where: {
            problem: { baseId: problem.baseId },
            createdAt: { lt: review.createdAt },
            status: { in: ['passed', 'rejected', 'needs_review'] },
         },
         orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
         select: { status: true, report: true, problemId: true, inputHash: true },
      });
      const previousReport = previousReview
         ? previousQualityFeedback(previousReview.status, previousReview.report)
         : undefined;

      let previousDiff: string | undefined;
      if (previousReview && previousReport) {
         const previous = await snapshot(previousReview.problemId);
         // A version can only serve as a baseline if it still matches the reviewed content.
         if (previous.hash === previousReview.inputHash) {
            previousDiff = createReviewDiff(
               previous.script,
               current.script,
            );
         }
      }

      const report = await generateJudgeQuality(
         current.input,
         current.script,
         review.model,
         entry => attempts.push(entry),
         previousDiff,
      );
      const latest = await snapshot(problemId);
      let status: 'stale' | 'passed' | 'rejected' | 'needs_review';
      if (latest.hash !== current.hash) {
         status = 'stale';
      } else if (qualityPassed(report)) {
         status = 'passed';
      } else {
         status = report.status === 'reject' ? 'rejected' : 'needs_review';
      }

      await prisma.problemQualityReview.update({
         where: { id: review.id },
         data: {
            status,
            report,
            generation: attempts as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
         },
      });
      if (status !== 'passed') {
         throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `AI 质量审核未通过（${status}），请查看审核报告并修正后重新提交。` });
      }
      return review.id;
   } catch (error) {
      if (error instanceof TRPCError) throw error;
      const knownError = error instanceof Error && [
         'LLM_NOT_CONFIGURED',
         'QUALITY_INPUT_TOO_LARGE',
      ].includes(error.message);

      let errorCode = 'QUALITY_PROVIDER_OR_OUTPUT_ERROR';
      if (error instanceof QualityGenerationError) {
         errorCode = error.attempts.at(-1)?.errorCode ?? 'QUALITY_DEADLINE_EXCEEDED';
      } else if (knownError) {
         errorCode = (error as Error).message;
      }

      await prisma.problemQualityReview.update({
         where: { id: review.id },
         data: {
            status: 'error',
            errorCode,
            generation: attempts as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
         },
      });
      throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: `AI 质量审核未完成（${errorCode}），本次不执行判题脚本，请稍后重试。` });
   }
}
