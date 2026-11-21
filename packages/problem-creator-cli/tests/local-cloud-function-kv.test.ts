import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalCloudFunctionKv } from '../src/services/local-judge/cloud-function-kv';

test('local cloud function KV persists across invocations within a run', async () => {
   let now = 10_000;
   const kv = new LocalCloudFunctionKv(() => now);
   const first = kv.forInvocation();
   await first.handle('mset', [
      [
         { key: 'task:1', value: { name: 'Cook' }, ttlSeconds: 2 },
         { key: 'task:2', value: 1 },
      ],
   ]);
   const second = kv.forInvocation();
   assert.deepEqual(await second.handle('keys', ['task:[12]']), [
      'task:1',
      'task:2',
   ]);
   assert.deepEqual(
      await second.handle('mget', [['task:2', 'task:1', 'missing']]),
      [1, { name: 'Cook' }, null],
   );
   assert.equal(await second.handle('incr', ['task:2', 2]), 3);
   assert.equal(await second.handle('ttl', ['task:1']), 2);
   now += 2_000;
   assert.equal(await second.handle('has', ['task:1']), false);
   assert.equal(await second.handle('ttl', ['task:1']), -2);
   assert.equal(
      await new LocalCloudFunctionKv().handle('get', ['task:2']),
      null,
   );
   assert.equal(await second.handle('clear', []), 1);
});

test('local KV counts batch writes within the per-invocation quota', async () => {
   const kv = new LocalCloudFunctionKv();
   const invocation = kv.forInvocation();
   const entries = Array.from({ length: 201 }, (_, i) => ({
      key: `k${i}`,
      value: i,
   }));
   await assert.rejects(invocation.handle('mset', [entries]), {
      code: 'KV_QUOTA_EXCEEDED',
   });
   await assert.rejects(invocation.handle('get', ['k199']), {
      code: 'KV_QUOTA_EXCEEDED',
   });
   const next = kv.forInvocation();
   assert.deepEqual(await next.handle('mget', [['k199', 'k200']]), [199, null]);
});
