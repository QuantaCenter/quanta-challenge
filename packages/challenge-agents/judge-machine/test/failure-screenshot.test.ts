import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { System, defineTestHandler, type ExposePage } from '../src/lib/system.js';
import { JRTP } from '../protocol/judge-result-transfer-protocal.js';
import { JudgeSuccessResultSchema } from '../src/schemas/judge-result.js';

const page = {} as ExposePage;
const image = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#e7ab64' } }).png().toBuffer();
const run = defineTestHandler(async () => {});

test('首个低分失败结束时截图，后续测试继续，已有比对图片保留且协议可传输', async () => {
   let state = '';
   const captured: string[] = [];
   const system = new System('judge', {}, '', async () => {
      captured.push(state);
      return image;
   });
   system.defineCheckPoint('通过', 10, () => 10);
   system.defineCheckPoint('低分', 10, async () => {
      state = 'first failure';
      await system.saveImage(image, 'comparison.png');
      return 3;
   });
   system.defineCheckPoint('后续失败', 10, () => {
      state = 'later failure';
      throw new Error('expected failure');
   });
   const result = await run(page, system);
   assert.deepEqual(captured, ['first failure']);
   assert.equal(state, 'later failure');
   assert.equal(result.totalScore, 13);
   assert.deepEqual(result.results.map(item => item.status), ['pass', 'fail', 'fail']);
   assert.equal(Object.keys(result.results[0]!.cacheFiles).length, 0);
   const files = result.results[1]!.cacheFiles;
   assert.equal(files['comparison.png'], image);
   const failureKey = Object.keys(files).find(key => /^first-failure-.+\.webp$/.test(key));
   assert.ok(failureKey);
   const meta = await sharp(files[failureKey]).metadata();
   assert.equal(meta.format, 'webp');
   assert.equal(meta.width, 80);
   assert.equal(meta.height, 60);
   assert.equal(Object.keys(result.results[2]!.cacheFiles).length, 0);
   const protocol = new JRTP();
   const payload = { ...result, type: 'done', message: 'done', judgeTime: 1, judgeRecordId: 1 };
   const restored = JudgeSuccessResultSchema.parse(protocol.unpack(protocol.pack(payload)));
   assert.deepEqual(restored.results[1]!.cacheFiles[failureKey], files[failureKey]);
});

test('异常型失败也截图，部分得分按 passScore 达标时不截图', async () => {
   let count = 0;
   const system = new System('audit', {}, '', async () => {
      count++;
      return image;
   });
   system.defineCheckPoint('允许部分得分', 10, () => 8, { passScore: 7 });
   system.defineCheckPoint('断言失败', 10, () => system.expect(false, '内容正确'));
   const result = await run(page, system);
   assert.equal(count, 1);
   assert.equal(result.results[0]!.status, 'pass');
   assert.equal(Object.keys(result.results[0]!.cacheFiles).length, 0);
   assert.equal(Object.keys(result.results[1]!.cacheFiles).length, 1);
   assert.match(result.results[1]!.details, /内容正确/);
});

test('全部通过不截图，不提供截图回调仍兼容原调用', async () => {
   let count = 0;
   const system = new System('judge', {}, '', async () => {
      count++;
      return image;
   });
   system.defineCheckPoint('通过', 10, () => 10);
   await run(page, system);
   assert.equal(count, 0);
   const legacy = new System('judge');
   legacy.defineCheckPoint('失败', 10, () => 0);
   const result = await run(page, legacy);
   assert.equal(result.results[0]!.status, 'fail');
   assert.deepEqual(result.results[0]!.cacheFiles, {});
});

for (const reason of ['closed page', 'invalid image']) {
   test(`截图失败不影响判题且不转而截取后续测试点：${reason}`, async () => {
      let count = 0;
      const system = new System('judge', {}, '', async () => {
         count++;
         if (reason === 'closed page') throw new Error('Page closed');
         return Buffer.from('invalid screenshot');
      });
      system.defineCheckPoint('失败一', 10, () => 2);
      system.defineCheckPoint('失败二', 10, () => 3);
      const result = await run(page, system);
      assert.equal(count, 1);
      assert.equal(result.status, 'fail');
      assert.equal(result.totalScore, 5);
      assert.ok(result.results.every(item => Object.keys(item.cacheFiles).length === 0));
   });
}

test('压缩后的 WebP 附件仍受 5MB 存储上限约束', async () => {
   const system = new System('judge');
   await assert.rejects(system.saveImage(Buffer.alloc(5 * 1024 * 1024 + 1), 'too-large.webp'), /5MB/);
   assert.deepEqual(system.files, {});
});
