import assert from 'node:assert/strict';
import test from 'node:test';
import prisma from '../lib/prisma';
import {
   dispatchTimerTask,
   registerTimerHandler,
   startTimerWorker,
   stopTimerWorker,
   withTimerTaskLease,
} from '../server/utils/timer';

async function waitUntil(check: () => Promise<boolean>, timeoutMs = 5000) {
   const deadline = Date.now() + timeoutMs;
   while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 25));
   }
   throw new Error('Timed out waiting for timer task');
}

test('transactional enqueue, isolated consumption and stale claim fencing', async () => {
   const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
   assert.equal(process.env.TIMER_INTEGRATION_TEST, '1');
   assert.equal(databaseUrl.hostname, '127.0.0.1');
   assert.equal(databaseUrl.pathname, '/quanta_timer_test');
   await prisma.timerTask.deleteMany({ where: { handlerId: { in: ['judge-quality', 'test-normal'] } } });
   let releaseQuality!: () => void;
   let qualityStarted = false;
   const qualityBlocked = new Promise<void>(resolve => { releaseQuality = resolve; });

   registerTimerHandler('judge-quality', async () => {
      qualityStarted = true;
      await qualityBlocked;
   });
   registerTimerHandler('test-normal', async () => {});

   try {
      await assert.rejects(prisma.$transaction(async (tx) => {
         await dispatchTimerTask('judge-quality', { private: 'reference answer' }, {}, tx);
         throw new Error('ROLLBACK');
      }), /ROLLBACK/);
      assert.equal(await prisma.timerTask.count({ where: { handlerId: 'judge-quality' } }), 0);

      const qualityId = await dispatchTimerTask('judge-quality', { private: 'reference answer' });
      const normalId = await dispatchTimerTask('test-normal');
      startTimerWorker({
         pollIntervalMs: 50, batchSize: 5, retryBackoffMs: 10, maxRetryBackoffMs: 20,
         isolatedHandlers: [{ handlerId: 'judge-quality', concurrency: 1, leaseMs: 300_000, clearPayload: true }],
      });

      await waitUntil(async () => qualityStarted);
      await waitUntil(async () => (await prisma.timerTask.findUniqueOrThrow({ where: { id: normalId } })).status === 'done');
      assert.equal((await prisma.timerTask.findUniqueOrThrow({ where: { id: qualityId } })).status, 'running');

      releaseQuality();
      await waitUntil(async () => (await prisma.timerTask.findUniqueOrThrow({ where: { id: qualityId } })).status === 'done');
      assert.equal((await prisma.timerTask.findUniqueOrThrow({ where: { id: qualityId } })).payload, null);

      const stale = await prisma.timerTask.create({
         data: { handlerId: 'judge-quality', status: 'running', runAt: new Date(), updatedAt: new Date(Date.now() - 360_000) },
      });
      const oldClaim = { taskId: stale.id, handlerId: 'judge-quality', attempts: 1, claimedAt: stale.updatedAt };
      await waitUntil(async () => (await prisma.timerTask.findUniqueOrThrow({ where: { id: stale.id } })).status === 'done');
      await assert.rejects(withTimerTaskLease(oldClaim, async () => 'unexpected'), /TIMER_LEASE_LOST/);
   } finally {
      releaseQuality();
      stopTimerWorker();
      await prisma.timerTask.deleteMany({ where: { handlerId: { in: ['judge-quality', 'test-normal'] } } });
      await prisma.$disconnect();
   }
});
