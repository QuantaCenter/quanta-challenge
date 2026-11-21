import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { WSContext } from 'hono/ws';
import { chromium } from 'playwright';
import { CloudFunctionInvokeSchema } from '../src/schemas/cloud-function.js';
import { JudgeCloudFunctions, routeJudgeCloudFunction } from '../src/services/cloud-function.js';

const socketFor = (send: (message: unknown) => void) =>
   new WSContext<WebSocket>({
      readyState: 1,
      send: (message) => send(JSON.parse(String(message))),
      close: () => {},
   });

test('only the matching socket and task can complete a cloud function RPC', async () => {
   const bridge = new JudgeCloudFunctions();
   let request: unknown;
   const socket = socketFor((message) => { request = message; });
   const unrelated = socketFor(() => {});
   const session = bridge.createSession(socket, 123, 'design');
   const invocation = session.invoke({ amount: 6 });
   const sent = CloudFunctionInvokeSchema.parse(request);
   assert.equal(sent.phase, 'design');
   assert.deepEqual(sent.input, { amount: 6 });

   const result = { ...sent, type: 'cloud-function-result', status: 200, body: { ok: true, data: 6 } };
   bridge.receive(unrelated, { ...result, status: 403 });
   bridge.receive(socket, { ...result, judgeRecordId: 456, status: 403 });
   bridge.receive(socket, result);
   assert.deepEqual(await invocation, { status: 200, body: { ok: true, data: 6 } });

   const disconnected = session.invoke(null);
   bridge.closeSocket(socket);
   assert.equal((await disconnected).status, 503);
   const finished = session.invoke(null);
   session.close();
   assert.equal((await finished).status, 503);
   assert.equal((await session.invoke(null)).status, 503);
});

test('page-load and relative cloud function requests are bridged without a browser token', {
   skip: !process.env.JUDGE_TEST_BROWSER,
}, async () => {
   const browser = await chromium.launch({ executablePath: process.env.JUDGE_TEST_BROWSER, headless: true });
   const server = createServer((request, response) => {
      if (request.url !== '/') {
         response.writeHead(404).end();
         return;
      }
      response.writeHead(200, { 'content-type': 'text/html' }).end(`
         <script>
         async function invoke(url, amount) {
            const response = await fetch(url, {
               method: 'POST',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ input: { amount } }),
            });
            return { status: response.status, body: await response.json() };
         }
         window.results = Promise.all([
            invoke('https://qpc-cloud-test.invalid/api/cloud-function/invoke/cart', 4),
            invoke('/api/cloud-function/cart', 6),
            invoke('/api/cloud-function/invoke/unbound', 999),
         ]);
         </script>
      `);
   });

   try {
      await new Promise<void>((resolve, reject) => {
         server.once('error', reject);
         server.listen(0, '127.0.0.1', resolve);
      });
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const bridge = new JudgeCloudFunctions();
      const inputs: unknown[] = [];
      const socket = socketFor((message) => {
         const request = CloudFunctionInvokeSchema.parse(message);
         assert.equal(request.judgeRecordId, 123);
         inputs.push(request.input);
         bridge.receive(socket, {
            ...request,
            type: 'cloud-function-result',
            status: 200,
            body: { ok: true, data: request.input },
         });
      });
      const session = bridge.createSession(socket, 123);
      try {
         await routeJudgeCloudFunction(context, 'cart', session.invoke);
         const page = await context.newPage();
         await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
         const results = await page.evaluate(() => (window as unknown as { results: Promise<unknown[]> }).results);
         assert.deepEqual(results, [
            { status: 200, body: { ok: true, data: { amount: 4 } } },
            { status: 200, body: { ok: true, data: { amount: 6 } } },
            { status: 403, body: { ok: false, error: { code: 'FORBIDDEN', message: '判题仅可调用题目绑定的云函数' } } },
         ]);
         assert.equal(inputs.length, 2);
      } finally {
         session.close();
         await context.close();
      }
   } finally {
      await browser.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
   }
});
