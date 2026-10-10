import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
   defineTestHandler,
   HttpClient,
   System,
} from '../src/lib/system.js';

const makeClient = (baseUrl = 'http://service:3000') =>
   new HttpClient({ baseUrl, timeoutMs: 1000, maxBytes: 1024 });

test('相对路径以 baseUrl 为根解析', () => {
   const client = makeClient('http://service:3000');
   // resolveUrl 是私有的，通过任何一次请求的 URL 间接验证；
   // 未连通的地址会抛"请求失败"，但错误信息里带着解析后的完整 URL。
   assert.rejects(
      () => client.get('/health'),
      (error: Error) => {
         assert.match(error.message, /http:\/\/service:3000\/health/);
         return true;
      }
   );
});

test('绝对 URL 只要与 baseUrl 同源就允许', async () => {
   const client = makeClient('http://service:3000');
   await assert.rejects(
      () => client.get('http://service:3000/api'),
      (error: Error) => {
         // 同源会走到真实请求，因此是"请求失败"而不是"越界"
         assert.doesNotMatch(error.message, /越界/);
         return true;
      }
   );
});

test('跨源绝对 URL 被拒绝（防 SSRF）', async () => {
   const client = makeClient('http://service:3000');
   await assert.rejects(
      () => client.get('http://169.254.169.254/latest/meta-data'),
      (error: Error) => {
         assert.match(error.message, /越界请求/);
         return true;
      }
   );
});

test('defineTestHandler 聚合检查点：通过 / 失败 / 未 return 记 0 分', async () => {
   const handler = defineTestHandler(async ({ http, $ }) => {
      $.defineCheckPoint('通过', 10, async () => {
         const res = await http.get('/ok');
         $.expect(res.status === 200, `期望 200，实际 ${res.status}`);
         return 10;
      });

      $.defineCheckPoint('失败', 5, async () => {
         $.expect(false, '故意失败');
         return 5;
      });

      // 没 return：即使断言全过也记 0 分（与前端题型同一个坑）
      $.defineCheckPoint('忘了 return', 20, async () => {
         $.expect(true, 'ok');
      });
   });

   const fakeHttp = {
      get: async () => ({ status: 200, headers: {}, text: '{}', buffer: Buffer.from('{}'), json: {} }),
   };

   const result = await handler(fakeHttp as unknown as HttpClient, new System('judge', {}));

   assert.equal(result.results.length, 3);
   assert.equal(result.results[0]!.status, 'pass');
   assert.equal(result.results[0]!.score, 10);
   assert.equal(result.results[1]!.status, 'fail');
   assert.equal(result.results[1]!.score, 0);
   assert.equal(result.results[2]!.status, 'fail');
   assert.equal(result.results[2]!.score, 0);
   assert.equal(result.totalScore, 10);
   assert.equal(result.status, 'fail');
});

test('全部通过时 status=completed，总分等于各检查点之和', async () => {
   const handler = defineTestHandler(async ({ http, $ }) => {
      for (const [name, score] of [['a', 10], ['b', 15]] as const) {
         $.defineCheckPoint(name, score, async () => {
            await http.get('/x');
            return score;
         });
      }
   });

   const fakeHttp = {
      get: async () => ({ status: 200, headers: {}, text: '', buffer: Buffer.alloc(0), json: undefined }),
   };

   const result = await handler(fakeHttp as unknown as HttpClient, new System('audit', {}));
   assert.equal(result.totalScore, 25);
   assert.equal(result.status, 'completed');
});
