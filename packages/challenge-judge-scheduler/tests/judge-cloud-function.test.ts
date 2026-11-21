import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { CF_HEADER, verifyCloudFunctionSignature } from '@challenge/shared/cloud-function';
import { JudgeCloudFunctionRelay } from '../src/services/judge-cloud-function';

const makeSocket = () => {
   const replies: unknown[] = [];
   const socket = {
      readyState: WebSocket.OPEN,
      send(data: unknown) {
         assert.equal(typeof data, 'string');
         replies.push(JSON.parse(data as string));
      },
   };
   return { socket, replies };
};

const secret = 'test-only-secret';
const configure = (t: TestContext) => {
   const settings = {
      CF_SERVER: 'https://cloud.example.test',
      CF_INTERNAL_SECRET: secret,
      CF_INTERNAL_KEY_ID: 'judge',
   };
   for (const [name, value] of Object.entries(settings)) {
      const previous = process.env[name];
      process.env[name] = value;
      t.after(() => {
         if (previous === undefined) delete process.env[name];
         else process.env[name] = previous;
      });
   }
};

const call = (input: unknown, phase?: 'design') => ({
   type: 'cloud-function-invoke',
   judgeRecordId: 3,
   requestId: randomUUID(),
   input,
   phase,
});

test('relays signed calls only for an active record on the bound socket', async (t) => {
   configure(t);
   const runIds: string[] = [];
   const relay = new JudgeCloudFunctionRelay(async (target, init) => {
      assert.equal(String(target), 'https://cloud.example.test/v1/invoke/cart-total/judge');
      assert.equal(init?.method, 'POST');
      assert.equal(init.redirect, 'error');
      const headers = new Headers(init.headers);
      assert.equal(headers.get(CF_HEADER.keyId), 'judge');
      assert.equal(headers.get(CF_HEADER.userId), null);
      assert.equal(headers.get('x-trace-id'), '0123456789abcdef0123456789abcdef');
      const body = String(init.body);
      assert.equal(verifyCloudFunctionSignature({
         method: 'POST',
         path: '/v1/invoke/cart-total/judge',
         timestamp: headers.get(CF_HEADER.timestamp)!,
         nonce: headers.get(CF_HEADER.nonce)!,
         signature: headers.get(CF_HEADER.signature)!,
         body,
         secret,
      }), true);
      const { judgeRecordId, runId, input, ...other } = JSON.parse(body);
      assert.equal(judgeRecordId, 3);
      assert.deepEqual(other, {});
      runIds.push(runId);
      if (input === 'reject') {
         return Response.json({
            ok: false,
            error: { code: 'FUNCTION_DISABLED', message: '已停用', details: 'internal' },
         }, { status: 409 });
      }
      return Response.json({ ok: true, data: { input, total: 7 }, meta: 'internal' });
   });
   const { socket, replies } = makeSocket();
   const otherSocket = makeSocket();
   const close = relay.register(socket, {
      judgeRecordId: 3,
      name: 'cart-total',
      designCapture: true,
      traceId: '0123456789abcdef0123456789abcdef',
   });

   const first = call({ values: [2, 5] });
   await relay.handle(otherSocket.socket, JSON.stringify(first));
   await relay.handle(socket, JSON.stringify({ ...first, judgeRecordId: 100 }));
   assert.deepEqual(runIds, []);
   const raw = JSON.stringify({ ...first, name: 'another-function', userId: 'someone' });
   await relay.handle(socket, raw);
   await relay.handle(socket, raw);
   await relay.handle(socket, JSON.stringify(call('reject')));
   await relay.handle(socket, JSON.stringify(call(null, 'design')));
   assert.equal(runIds.length, 3);
   assert.equal(runIds[0], runIds[1]);
   assert.notEqual(runIds[0], runIds[2]);
   assert.deepEqual(replies[0], {
      type: 'cloud-function-result',
      judgeRecordId: 3,
      requestId: first.requestId,
      status: 200,
      body: { ok: true, data: { input: { values: [2, 5] }, total: 7 } },
   });
   assert.deepEqual(replies[1] && (replies[1] as { body: unknown }).body, {
      ok: false,
      error: { code: 'FUNCTION_DISABLED', message: '已停用' },
   });

   close();
   await relay.handle(socket, JSON.stringify(call(null)));
   assert.equal(runIds.length, 3);
});

test('rejects unavailable phases and large inputs and cancels calls on disconnect', async (t) => {
   configure(t);
   let signal: AbortSignal | undefined;
   const relay = new JudgeCloudFunctionRelay(async (_target, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
         signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
      });
   });
   const { socket, replies } = makeSocket();
   relay.register(socket, { judgeRecordId: 3, name: 'cart-total', designCapture: false });

   await relay.handle(socket, JSON.stringify(call(null, 'design')));
   await relay.handle(socket, JSON.stringify(call('x'.repeat(256 * 1024))));
   assert.equal(signal, undefined);
   assert.deepEqual(replies.map((reply) => (reply as { status: number }).status), [403, 413]);

   const pending = relay.handle(socket, JSON.stringify(call({ values: [] })));
   assert.ok(signal);
   relay.close(socket);
   await pending;
   assert.equal((signal as AbortSignal).aborted, true);
   assert.equal(replies.length, 2);
});
