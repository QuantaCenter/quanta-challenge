import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'bullmq';
import taskRoute from '../src/controllers/task';
import { QueueService } from '../src/services/queue';
import { RedisService } from '../src/services/redis';

test('repeated audit dispatch keeps one job, including after completion', async () => {
   assert.equal(process.env.TIMER_INTEGRATION_TEST, '1');
   assert.equal(process.env.REDIS_HOST, '127.0.0.1');
   assert.equal(process.env.REDIS_PORT, '56379');

   const queue = QueueService.instance.getQueue('judge-task');
   const payload = {
      problemId: 123,
      judgeRecordId: 456,
      userId: 'test-user',
      judgeScript: 'test script',
      fsSnapshot: {},
      mode: 'audit',
   };
   const dispatch = () => taskRoute.request('/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
   });
   let worker: Worker | undefined;

   try {
      await queue.obliterate({ force: true });
      assert.equal((await dispatch()).status, 201);
      assert.equal((await dispatch()).status, 201);
      assert.equal((await queue.getJobCounts('waiting')).waiting, 1);

      worker = new Worker('judge-task', async () => 'done', {
         connection: { host: '127.0.0.1', port: 56379 },
      });
      await new Promise<void>((resolve, reject) => {
         const timeout = setTimeout(() => reject(new Error('job timed out')), 5000);
         worker!.once('completed', () => {
            clearTimeout(timeout);
            resolve();
         });
         worker!.once('error', reject);
      });
      await worker.close();
      worker = undefined;

      assert.equal((await dispatch()).status, 201);
      assert.equal((await queue.getJobCounts('completed')).completed, 1);
      assert.equal((await queue.getJobCounts('waiting')).waiting, 0);
   } finally {
      await worker?.close();
      await queue.obliterate({ force: true });
      await queue.close();
      RedisService.instance.destroy();
   }
});
