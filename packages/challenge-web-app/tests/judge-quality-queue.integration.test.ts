import assert from 'node:assert/strict';
import test from 'node:test';
import prisma from '../lib/prisma';
import { enqueueJudgeQuality } from '../server/services/judge-quality';
import { registerJudgeQualityHandler } from '../server/services/judge-quality-task';
import { startTimerWorker, stopTimerWorker } from '../server/utils/timer';

async function waitUntil(check: () => Promise<boolean>, timeoutMs = 5000) {
   const deadline = Date.now() + timeoutMs;
   while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 25));
   }
   throw new Error('Timed out waiting for audit');
}

test('AI review dispatch is transactional, retryable and does not dispatch rejected scripts', async () => {
   const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
   assert.equal(process.env.TIMER_INTEGRATION_TEST, '1');
   assert.equal(databaseUrl.hostname, '127.0.0.1');
   assert.equal(databaseUrl.pathname, '/quanta_timer_test');

   Object.assign(globalThis, {
      useRuntimeConfig: () => ({ llm: { model: 'test', apiKey: 'test-key', responsesUrl: 'https://model.test/responses' } }),
   });
   const originalFetch = globalThis.fetch;
   let modelCalls = 0;
   let dispatchCalls = 0;
   const dispatchedRecordIds: number[] = [];
   let modelVerdict = 'pass';
   let rejectDispatch = false;
   globalThis.fetch = async (url, init) => {
      if (String(url) === 'https://model.test/responses') {
         modelCalls++;
         if (modelVerdict === 'auth-error') return new Response('', { status: 401 });
         return new Response(JSON.stringify({ status: 'completed', output: [{
            type: 'message', role: 'assistant', content: [{
               type: 'output_text', text: JSON.stringify({ status: modelVerdict, reason: '审核结果' }),
            }],
         }] }));
      }
      dispatchCalls++;
      dispatchedRecordIds.push(JSON.parse(String(init?.body)).judgeRecordId);
      if (rejectDispatch) return new Response('', { status: 400 });
      if (dispatchCalls === 1) throw new Error('temporary dispatch failure');
      return new Response('', { status: 201 });
   };

   const user = await prisma.user.create({ data: { name: `timer-test-${Date.now()}` } });
   registerJudgeQualityHandler();

   async function createAudit(rollback = false) {
      return prisma.$transaction(async (tx) => {
         const base = await tx.baseProblems.create({ data: { authorId: user.id } });
         const problem = await tx.problems.create({ data: {
            baseId: base.id, title: 'test', detail: 'test', difficulty: 'easy', totalScore: 1,
            status: 'draft', judgeUploadPath: '/', JudgeFile: { create: { judgeScript: 'test script' } },
         } });
         const record = await tx.judgeRecords.create({ data: {
            problemId: problem.pid, userId: user.id, type: 'audit', info: {},
         } });
         const review = await enqueueJudgeQuality(problem.pid, {
            judgeServerUrl: 'https://scheduler.test', traceId: 'test', userId: user.id,
            problemId: problem.pid, judgeRecordId: record.id, judgeScript: 'test script', fsSnapshot: { '/answer': 'private' },
         }, tx);
         if (rollback) throw new Error('ROLLBACK_AUDIT');
         return { problem, record, review };
      });
   }

   try {
      await assert.rejects(createAudit(true), /ROLLBACK_AUDIT/);
      assert.equal(await prisma.baseProblems.count({ where: { authorId: user.id } }), 0);
      assert.equal(await prisma.timerTask.count({ where: { handlerId: 'judge-quality' } }), 0);

      const approved = await createAudit();
      await assert.rejects(prisma.$transaction(async (tx) => {
         await enqueueJudgeQuality(approved.problem.pid, {
            judgeServerUrl: 'https://scheduler.test', traceId: 'duplicate', userId: user.id,
            problemId: approved.problem.pid, judgeRecordId: approved.record.id, judgeScript: 'test script',
         }, tx);
      }));
      assert.equal(await prisma.problemQualityReview.count({ where: { problemId: approved.problem.pid } }), 1);

      startTimerWorker({
         pollIntervalMs: 50, batchSize: 5, retryBackoffMs: 10, maxRetryBackoffMs: 20,
         isolatedHandlers: [{ handlerId: 'judge-quality', concurrency: 1, leaseMs: 300_000, clearPayload: true }],
      });
      await waitUntil(async () => (await prisma.timerTask.findFirstOrThrow({ where: { handlerId: 'judge-quality' } })).status === 'done');
      assert.equal(modelCalls, 1, 'dispatch retry must reuse the completed AI review');
      assert.equal(dispatchCalls, 2);
      assert.deepEqual(dispatchedRecordIds, [approved.record.id, approved.record.id]);
      assert.equal((await prisma.problemQualityReview.findUniqueOrThrow({ where: { id: approved.review.id } })).status, 'passed');
      assert.equal((await prisma.timerTask.findFirstOrThrow({ where: { handlerId: 'judge-quality' } })).payload, null);

      modelVerdict = 'reject';
      const rejected = await createAudit();
      await waitUntil(async () => (await prisma.problems.findUniqueOrThrow({ where: { pid: rejected.problem.pid } })).status === 'invalid');
      await waitUntil(async () => (await prisma.timerTask.count({ where: { handlerId: 'judge-quality', status: 'done' } })) === 2);
      assert.equal(dispatchCalls, 2, 'rejected script must never be dispatched');
      assert.equal((await prisma.judgeRecords.findUniqueOrThrow({ where: { id: rejected.record.id } })).result, 'failed');

      modelVerdict = 'auth-error';
      const failedModel = await createAudit();
      await waitUntil(async () => (await prisma.problems.findUniqueOrThrow({ where: { pid: failedModel.problem.pid } })).status === 'invalid');
      const modelError = await prisma.problemQualityReview.findUniqueOrThrow({ where: { id: failedModel.review.id } });
      assert.equal(modelError.errorCode, 'QUALITY_AUTH_FAILED');
      assert.equal(dispatchCalls, 2, 'model errors must not dispatch the script');

      modelVerdict = 'pass';
      rejectDispatch = true;
      const failedDispatch = await createAudit();
      await waitUntil(async () => (await prisma.problems.findUniqueOrThrow({ where: { pid: failedDispatch.problem.pid } })).status === 'invalid');
      assert.equal((await prisma.problemQualityReview.findUniqueOrThrow({ where: { id: failedDispatch.review.id } })).errorCode, 'QUALITY_TASK_FAILED');
      await waitUntil(async () => (await prisma.timerTask.count({ where: { handlerId: 'judge-quality', status: 'done' } })) === 4);
   } finally {
      stopTimerWorker();
      globalThis.fetch = originalFetch;
      await prisma.timerTask.deleteMany({ where: { handlerId: 'judge-quality' } });
      await prisma.judgeRecords.deleteMany({ where: { userId: user.id } });
      await prisma.baseProblems.deleteMany({ where: { authorId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.$disconnect();
   }
});
