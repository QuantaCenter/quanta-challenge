/**
 * 一次性种子脚本：发布一个云函数 + 一道用到该云函数的题目（直接写 DB）。
 *
 * 用法（在 packages/database 下执行）：
 *   node scripts/seed-cloud-function-demo.mjs
 *
 * 幂等：会先删除同名云函数与同名题目（级联清理版本/项目/判题脚本），再重建。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// 读取连接串（避免硬编码；文件里出现 dotenv 路径，不经过 shell）
const env = Object.fromEntries(
   fs
      .readFileSync(path.join(here, '..', '.env'), 'utf-8')
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
         const index = line.indexOf('=');
         return [
            line.slice(0, index).trim(),
            line
               .slice(index + 1)
               .trim()
               .replace(/^["']|["']$/g, ''),
         ];
      }),
);
process.env.DATABASE_URL = env.DATABASE_URL;

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const FUNCTION_NAME = 'counter';
const PROBLEM_TITLE = '云函数计数器（Demo）';
const TOTAL_SCORE = 300;

// ── 1. 云函数源码 ───────────────────────────────────────────────────────────
// source：后台展示用的 TS 源码
// compiledCode：真正被执行的单文件 CJS（这里手写，等价于 esbuild 的产物）
const functionSource = `/** 按用户隔离的计数器云函数。 */
export default async function (ctx) {
   const { input, kv } = ctx;
   const action = (input && typeof input === 'object' && input.action) || 'get';

   if (action === 'inc') {
      const by = Number((input && input.by) || 1) || 1;
      const count = await kv.incr('count', by);
      return { action, count };
   }

   if (action === 'reset') {
      await kv.set('count', 0);
      return { action, count: 0 };
   }

   const count = Number(await kv.get('count')) || 0;
   return { action: 'get', count };
}
`;

const compiledCode = `module.exports = async function (ctx) {
   const { input, kv } = ctx;
   const action = (input && typeof input === 'object' && input.action) || 'get';

   if (action === 'inc') {
      const by = Number((input && input.by) || 1) || 1;
      const count = await kv.incr('count', by);
      return { action, count };
   }

   if (action === 'reset') {
      await kv.set('count', 0);
      return { action, count: 0 };
   }

   const count = Number(await kv.get('count')) || 0;
   return { action: 'get', count };
};
`;

// ── 2. 题目模板文件（会被挂载到 WebContainer 的 /project 下）───────────────
const templateFiles = {
   'index.html': `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>云函数计数器</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <main class="card">
      <h1>点击计数器</h1>
      <button id="btn" type="button">点击次数：0</button>
      <p id="tip" class="tip">正在连接云端…</p>
    </main>
    <script type="module" src="./main.js"></script>
  </body>
</html>
`,
   'style.css': `* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #111111;
  color: #e5e5e5;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  padding: 2.5rem 3rem;
  border: 1px solid #434343;
  border-radius: 1rem;
  background: #1c1c1c;
}
h1 { margin: 0; font-size: 1.25rem; font-weight: 700; }
button {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  color: #111111;
  background: #a6fb1d;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
}
button:active { transform: scale(0.97); }
.tip { margin: 0; font-size: 0.8125rem; color: #9d9d9d; }
`,
   'main.js': `const btn = document.querySelector('#btn');
const tip = document.querySelector('#tip');

// 平台上云函数服务的地址（本地开发就是 http://localhost:3000）
const CF_BASE_URL = 'http://localhost:3000';
// 令牌：点左侧边栏的钥匙图标 →「云函数调用凭证」里复制，粘到这里
const CF_TOKEN = '在此粘贴你的云函数调用令牌';

let count = 0;
// 供判题脚本观察是否真的调用了云函数
window.__CF_CALLED__ = false;

const render = () => {
  btn.textContent = '点击次数：' + count;
};

async function callCloudFunction(action, by) {
  const res = await fetch(CF_BASE_URL + '/api/cloud-function/counter', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + CF_TOKEN,
    },
    body: JSON.stringify({ input: { action, by } }),
  });
  if (!res.ok) throw new Error('cloud function failed: ' + res.status);
  const { data } = await res.json();
  return data;
}

async function init() {
  try {
    const data = await callCloudFunction('get');
    window.__CF_CALLED__ = true;
    count = Number(data?.count) || 0;
    tip.textContent = '已连接云函数：进度按用户保存在云端';
  } catch (error) {
    // 云端不可用时退回本地计数，保证页面仍可交互
    tip.textContent = '云端不可用，已切换为本地计数';
  }
  render();
}

btn.addEventListener('click', () => {
  // 先本地递增（保证交互确定），再尽力同步到云端
  count += 1;
  render();
  callCloudFunction('inc', 1)
    .then((data) => {
      if (data && typeof data.count === 'number') {
        count = data.count;
        render();
      }
    })
    .catch(() => undefined);
});

init();
`,
};

// ── 3. 判题脚本 ─────────────────────────────────────────────────────────────
const judgeScript = `export default defineTestHandler(async ({ page, $ }) => {
   $.defineCheckPoint('页面包含计数器按钮', 100, async ({ score }) => {
      await page.waitForSelector('#btn');
      $.expect(
         (await page.locator('#btn').count()) === 1,
         '页面存在 #btn 按钮',
      );
      score.increment(100);
   });

   $.defineCheckPoint('点击按钮计数递增', 200, async ({ score }) => {
      const readCount = async () => {
         const text = (await page.locator('#btn').textContent()) || '';
         const match = text.match(/(\\d+)/);
         return match ? Number(match[1]) : NaN;
      };

      const start = await readCount();
      $.expect(Number.isFinite(start), '按钮文本包含计数数字');
      score.increment(100);

      await page.click('#btn');
      await page.click('#btn');
      const after = await readCount();
      $.expect(after === start + 2, '点击两次后计数 +2（' + start + ' → ' + after + '）');
      score.increment(100);
   });
});
`;

const detail = `# 云函数计数器

## 题目描述

平台提供了一套**云函数**能力：你可以把一小段逻辑发布到云端，并在自己的页面里用普通
HTTP 请求调用它。本题要求你实现一个"云端计数器"页面。

### 要求

1. 页面上有一个按钮，\`id\` 为 \`btn\`。
2. 按钮文本格式为 \`点击次数：X\`，其中 \`X\` 是当前计数。
3. 页面加载时，通过云函数读取当前计数。
4. 每次点击按钮，计数 +1，并通过云函数把进度同步到云端。

### 云函数调用方式

云函数挂在平台上，用**完整地址**请求（做题预览页与判题环境里都一样），并把令牌放进
\`Authorization: Bearer <令牌>\` 请求头：

\`\`\`js
const res = await fetch('http://localhost:3000/api/cloud-function/counter', {
   method: 'POST',
   headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + CF_TOKEN,
   },
   body: JSON.stringify({ input: { action: 'inc', by: 1 } }),
});
const { data } = await res.json(); // { action: 'inc', count: 3 }
\`\`\`

> **令牌从哪来**：点左侧边栏的钥匙图标 →「云函数调用凭证」，复制里面的令牌，
> 粘到模板里的 \`CF_TOKEN\` 常量。地址填平台地址（本地开发就是
> \`http://localhost:3000\`）。

\`action\` 支持 \`get\` / \`inc\` / \`reset\`。计数按**用户隔离**保存在云端 KV 里，
刷新页面后仍然保留。

> 提示：模板已经给出了可直接运行的实现（记得先把令牌填上），你可以在此基础上改造
> 界面与交互。
`;

// ── 执行 ────────────────────────────────────────────────────────────────────
const run = async () => {
   const author =
      (await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } })) ??
      (await prisma.user.findFirst());
   if (!author) {
      throw new Error('数据库里没有任何用户，无法确定 authorId');
   }
   console.log(`使用作者：${author.name} (${author.id})`);

   // 1) 云函数
   await prisma.cloudFunction.deleteMany({ where: { name: FUNCTION_NAME } });
   const fn = await prisma.cloudFunction.create({
      data: {
         name: FUNCTION_NAME,
         description: '按用户隔离的计数器：get / inc / reset',
         enabled: true,
         kvUserIsolated: true,
         timeoutMs: 5000,
         createdBy: author.id,
      },
   });
   const version = await prisma.cloudFunctionVersion.create({
      data: {
         functionId: fn.id,
         version: 1,
         source: functionSource,
         compiledCode,
         sourceHash: createHash('sha256').update(functionSource).digest('hex'),
         createdBy: author.id,
      },
   });
   await prisma.cloudFunction.update({
      where: { id: fn.id },
      data: { activeVersionId: version.id },
   });
   console.log(`✅ 云函数已发布：${FUNCTION_NAME}（v1）`);

   // 2) 题目（先清理同名）
   const existing = await prisma.baseProblems.findMany({
      where: { ProblemVersions: { some: { title: PROBLEM_TITLE } } },
      select: { id: true },
   });
   if (existing.length > 0) {
      await prisma.baseProblems.deleteMany({
         where: { id: { in: existing.map((row) => row.id) } },
      });
   }

   // BaseProblems.currentPid 与 Problems.baseId 互相引用：
   // 先建 base（currentPid 置空）→ 建 problem（拿真实 baseId）→ 回填 currentPid。
   const base = await prisma.baseProblems.create({
      data: { authorId: author.id },
   });

   const problem = await prisma.problems.create({
      data: {
         baseId: base.id,
         title: PROBLEM_TITLE,
         detail,
         difficulty: 'easy',
         totalScore: TOTAL_SCORE,
         status: 'published',
         // 题目是静态站点：无需安装/构建，提交时整包 project 目录
         bootCommand: null,
         initCommand: '[dev-server] npx -y serve@14.2.6 -l 3000 project',
         buildCommand: 'node -e ""',
         judgeUploadPath: 'project',
         // 本题需要云函数：开启后做题页侧边栏会出现「云函数调用凭证」入口
         enableCloudFunction: true,
      },
   });

   await prisma.baseProblems.update({
      where: { id: base.id },
      data: { currentPid: problem.pid },
   });

   await prisma.judgeFiles.create({
      data: { problemId: problem.pid, judgeScript },
   });

   await prisma.judgeStatus.create({
      data: { problemId: problem.pid, totalCount: 0, passedCount: 0 },
   });

   // 3) 模板项目（编辑器的初始文件）
   const project = await prisma.projects.create({
      data: {
         isTemplate: true,
         name: `${PROBLEM_TITLE}-template`,
         ownerId: author.id,
         problemId: problem.pid,
      },
   });
   const fileSystem = await prisma.fileSystems.create({
      data: { ownerId: author.id, projectId: project.pid },
   });
   await prisma.virtualFiles.createMany({
      data: Object.entries(templateFiles).map(([filePath, content]) => ({
         path: filePath,
         content,
         ownerId: author.id,
         fileSystemFsid: fileSystem.fsid,
      })),
   });

   console.log(
      `✅ 题目已创建：pid=${problem.pid} baseId=${base.id}（模板文件 ${Object.keys(templateFiles).length} 个）`,
   );
   console.log(`\n打开地址：/challenge/${problem.pid}`);
};

run()
   .catch((error) => {
      console.error('❌ 种子失败：', error);
      process.exitCode = 1;
   })
   .finally(() => prisma.$disconnect());
