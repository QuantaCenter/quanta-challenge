import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { VM } from 'vm2';
import { System, defineTestHandler, getExposePage } from '../src/lib/system.js';

test('真实浏览器与 VM2：保存首个失败时的页面，而非后续页面', {
   skip: !process.env.JUDGE_TEST_BROWSER,
}, async () => {
   const browser = await chromium.launch({ executablePath: process.env.JUDGE_TEST_BROWSER, headless: true });
   try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await page.setContent('<style>body { margin: 0; background: white; }</style><h1>测试页面</h1>');
      const system = new System('judge', {}, '', () => page.screenshot({ type: 'png', fullPage: true, timeout: 2000 }));
      const vm = new VM({ sandbox: { page: getExposePage(page), system, defineTestHandler } });
      const result = await vm.run(`
         const run = defineTestHandler(async ({ page, $ }) => {
            $.defineCheckPoint('首个失败', 10, async () => {
               await page.evaluate(() => {
                  document.body.style.background = 'rgb(255, 0, 0)';
                  document.querySelector('h1').textContent = '首个失败现场';
               });
               $.expect(false, '按钮应该打开内容');
            });
            $.defineCheckPoint('后续通过', 10, async () => {
               await page.evaluate(() => {
                  document.body.style.background = 'rgb(0, 0, 255)';
                  document.querySelector('h1').textContent = '后续测试页面';
               });
               return 10;
            });
         });
         run(page, system);
      `);
      assert.equal(result.results[0].status, 'fail');
      assert.equal(result.results[1].status, 'pass');
      const buffers = Object.values(result.results[0].cacheFiles) as Buffer[];
      assert.equal(buffers.length, 1);
      assert.equal((await sharp(buffers[0]!).metadata()).format, 'webp');
      const { data, info } = await sharp(buffers[0]!).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const offset = (info.width + 1) * info.channels;
      // WebP 为有损编码；颜色允许少量偏差，但应当是首个失败的红色，不能是后续蓝色。
      assert.ok(data[offset]! > 240 && data[offset + 1]! < 15 && data[offset + 2]! < 15);
      assert.equal(await page.locator('h1').textContent(), '后续测试页面');
      if (process.env.JUDGE_TEST_ARTIFACT) {
         const destination = process.env.JUDGE_TEST_ARTIFACT;
         await mkdir(path.dirname(destination), { recursive: true });
         await writeFile(destination, buffers[0]!);
      }
   } finally {
      await browser.close();
   }
});
