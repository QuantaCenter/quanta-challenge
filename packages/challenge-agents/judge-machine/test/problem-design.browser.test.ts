import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright';
import { JRTP } from '../protocol/judge-result-transfer-protocal.js';
import { captureProblemDesign } from '../src/services/problem-design.js';

const fixturePage = `
<!doctype html>
<html lang="zh-CN">
<head>
   <meta charset="utf-8">
   <title>标准答案</title>
   <style>
      body { background: #edf2f7; }
      main { background: white; padding: 24px; }
      h1 { text-align: center; -webkit-text-fill-color: #3344aa; color: #bb2200; }
      h1::before { content: "✓ "; color: green; }
      .banner { width: 100px; height: 20px; background: url(/pattern.svg); }
   </style>
</head>
<body>
   <main>
      <h1 id="heading">设计稿测试</h1>
      <img alt="标记" src="/pattern.svg" width="32" height="32">
      <div class="banner"></div>
      <canvas width="16" height="16"></canvas>
   </main>
   <script>
      const context = document.querySelector('canvas').getContext('2d');
      context.fillStyle = '#ff6600';
      context.fillRect(0, 0, 16, 16);
   </script>
</body>
</html>`;

test('从真实标准答案页面采集原生图层和素材，并保留选中的图层模式', {
   skip: !process.env.JUDGE_TEST_BROWSER,
}, async () => {
   const server = createServer((request, response) => {
      if (request.url === '/pattern.svg') {
         response.setHeader('Content-Type', 'image/svg+xml');
         response.end('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#38a169"/></svg>');
         return;
      }
      response.setHeader('Content-Type', 'text/html');
      response.end(fixturePage);
   });
   server.listen(0, '127.0.0.1');
   await once(server, 'listening');
   try {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const url = `http://127.0.0.1:${address.port}/`;
      const browser = await chromium.launch({
         headless: true,
         executablePath: process.env.JUDGE_TEST_BROWSER,
      });
      try {
         for (const structure of ['hierarchical', 'flat'] as const) {
            const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
            const design = await captureProblemDesign(context, url, structure);
            assert.equal(design.structure, structure);
            assert.equal(design.title, '标准答案');
            assert.equal(design.width, 800);
            assert.ok(design.nodes.some((node) => node.text?.includes('设计稿测试')));
            assert.ok(design.nodes.some((node) => node.pseudoElement === '::before'));
            assert.ok(design.nodes.some((node) => node.kind === 'image' && node.assetId));
            assert.ok(design.nodes.some((node) => node.backgroundAssetId));
            assert.ok(design.nodes.some((node) => node.tag === 'canvas' && node.assetId));
            assert.match(design.referenceImage, /^data:image\/jpeg;base64,/);
            const heading = design.nodes.find((node) => node.name === 'heading');
            assert.ok(heading);
            assert.equal(heading.parentId === null, structure === 'flat');
            const headingText = design.nodes.find((node) => node.tag === '#text' && node.text === '设计稿测试');
            assert.ok(headingText);
            assert.equal(headingText.inspection?.textAlign ?? headingText.style['text-align'], 'center');
            assert.equal(headingText.inspection?.textFillColor ?? headingText.style['-webkit-text-fill-color'], 'rgb(51, 68, 170)');
            assert.deepEqual(context.pages(), []);
         }
      } finally {
         await browser.close();
      }
   } finally {
      server.close();
      await once(server, 'close');
   }
});

test('设计稿在判题协议中作为普通 JSON 无损传递', () => {
   const protocol = new JRTP();
   const raw = {
      designDocument: { version: 1, nested: [[1, [2, 3]]], style: { type: 'Buffer' } },
      firstScreen: Buffer.from('image'),
   };
   assert.deepEqual(protocol.unpack(protocol.pack(raw)), raw);
   const output = protocol.unpack(protocol.pack({ designDocument: { title: '甲\0乙\uD800' } }));
   assert.equal(output.designDocument.title, '甲\uFFFD乙\uFFFD');
});
