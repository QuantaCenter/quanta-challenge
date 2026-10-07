import type { Difficulty } from '../domain/problem-config';

export interface ScaffoldVars {
   title: string;
   difficulty: Difficulty;
   tagIds: number[];
   /** 站点根目录 / 判题打包目录 */
   mountPath: string;
   initCommand: string;
}

export interface ScaffoldFile {
   /** 相对题目目录的 posix 路径 */
   path: string;
   content: string;
}

const FENCE = '```';

/**
 * `qpc init` 产出的题目骨架。
 *
 * 刻意**不留任何占位符标记**（如 `{{title}}`）：脚手架的产物会立刻被复制、
 * 改成自己的题目，残留一堆模板语法只会让人以为漏填了什么。
 * 所有可变内容在生成时一次性插值。
 *
 * judge.js 与 template/index.html 的内容同时是**示例**：
 * 它们必须能通过 `qpc check`（零 error），否则脚手架第一天就教错了写法。
 * 对应的断言在 tests/e2e/init.test.ts 里。
 */
export const buildProblemScaffold = (vars: ScaffoldVars): ScaffoldFile[] => {
   const { title, difficulty, tagIds, mountPath, initCommand } = vars;

   const config = `import { defineProblemConfig } from '@challenge/problem-creator-cli';

// 出题配置。字段说明见 packages/problem-creator-cli/README.md
export default defineProblemConfig({
   title: '${title}',
   detail: [
      '## 题目要求',
      '',
      '用一两句话写清"学生要做什么"，以及判分关注的行为。',
      '',
      '- 点击 +1 按钮，当前计数加一',
      '- 计数达到 3 时显示"已达标"',
      '- 计数为 0 时重置按钮不可用',
      '',
      '## 提示',
      '',
      '题面支持 Markdown，会原样展示给学生。',
   ].join('\\n'),
   difficulty: '${difficulty}',
   tagIds: [${tagIds.join(', ')}],
   // totalScore 留空时以判题脚本里各检查点分值之和为准；
   // 填写则必须与之相等，否则审计会失败（见 qpc check 的 CFG001）。
   cover: { mode: 'default' },
   runtime: {
      // 判题打包目录，同时决定快照键前缀（/project/...）
      judgeUploadPath: '${mountPath}',
      initCommand: '${initCommand}',
   },
   paths: {
      template: 'template',
      answer: 'answer',
      judge: 'judge.js',
   },
});
`;

   // 判题脚本模板：不使用反引号与嵌套模板串，便于在多种终端/编辑器里复制粘贴。
   const judge = `// 判题脚本。必须写成 \`export default defineTestHandler(...)\`：
// 判题机内部把这段文本里的 "export default " 替换成 "const run = " 后执行。
export default defineTestHandler(async ({ page, $ }) => {
   const text = async (selector) => {
      const element = await page.$(selector);
      if (!element) throw new Error('找不到元素 ' + selector);
      return (await element.textContent()).trim();
   };

   // 目标按钮可能处于 disabled 状态：Playwright 的 click 会重试到 30 秒超时。
   // 需要"即使禁用也点一下"时用合成事件，它会照常触发应用的监听器。
   const clickEvenIfDisabled = async (selector) => {
      await page.$eval(selector, (element) => {
         element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await page.waitForTimeout(150);
   };

   $.defineCheckPoint('初始计数为 0', 5, async () => {
      const actual = await text('#count');
      $.expect(actual === '0', '期望 #count 为 "0"，实际为 "' + actual + '"');
      return 5; // 必须 return 本检查点得分：不返回即使断言全过也记 0 分
   });

   $.defineCheckPoint('点击 3 次后计数为 3', 10, async () => {
      for (let i = 0; i < 3; i += 1) {
         // 这个按钮本就应该可用：用真实 click 并加短超时，失败时快速暴露
         await page.click('#inc', { timeout: 3000 });
      }
      const actual = await text('#count');
      $.expect(actual === '3', '期望 #count 为 "3"，实际为 "' + actual + '"');
      return 10;
   });

   $.defineCheckPoint('计数达到 3 后提示已达标', 5, async () => {
      const actual = await text('#tip');
      $.expect(actual === '已达标', '期望 #tip 为 "已达标"，实际为 "' + actual + '"');
      return 5;
   });

   // 需要验证"禁用状态下点击不生效"时：
   // await clickEvenIfDisabled('#reset');
   void clickEvenIfDisabled;
});
`;

   const sharedMarkup = (script: string): string => `<!doctype html>
<html lang="zh-CN">
   <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title}</title>
      <style>
         :root {
            color-scheme: light dark;
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
         }
         body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f6f7f9;
            color: #1f2328;
         }
         .card {
            width: min(28rem, 90vw);
            padding: 2rem;
            border-radius: 1rem;
            background: #fff;
            box-shadow: 0 12px 32px rgb(15 23 42 / 12%);
         }
         h1 {
            margin: 0 0 1rem;
            font-size: 1.25rem;
         }
         .count {
            margin: 0 0 1rem;
            font-size: 1.5rem;
         }
         .actions {
            display: flex;
            gap: 0.75rem;
         }
         button {
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            border: 1px solid #d0d7de;
            background: #fff;
            font-size: 1rem;
            cursor: pointer;
         }
         button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
         }
         #tip {
            min-height: 1.5rem;
            margin: 1rem 0 0;
            color: #1a7f37;
            font-weight: 600;
         }
      </style>
   </head>
   <body>
      <main class="card">
         <h1>${title}</h1>
         <p class="count">当前计数：<span id="count">0</span></p>
         <div class="actions">
            <button id="inc" type="button">+1</button>
            <button id="reset" type="button" disabled>重置</button>
         </div>
         <p id="tip"></p>
      </main>
      <script type="module">
${script}
      </script>
   </body>
</html>
`;

   // 模板：结构与样式齐全（保证首屏好看、封面稳定），逻辑留给学生
   const templateHtml = sharedMarkup(`         // TODO: 在这里实现计数逻辑
         // 1) 点击 #inc，计数加一，并更新 #count 的文本
         // 2) 计数达到 3 时，#tip 显示"已达标"
         // 3) 计数为 0 时 #reset 处于 disabled
`);

   // 参考解：必须拿满分，且首屏即封面，初始渲染要稳定、好看
   const answerHtml =
      sharedMarkup(`         const countEl = document.querySelector('#count');
         const tipEl = document.querySelector('#tip');
         const incBtn = document.querySelector('#inc');
         const resetBtn = document.querySelector('#reset');

         let count = 0;

         const render = () => {
            countEl.textContent = String(count);
            tipEl.textContent = count >= 3 ? '已达标' : '';
            resetBtn.disabled = count === 0;
         };

         incBtn.addEventListener('click', () => {
            count += 1;
            render();
         });

         resetBtn.addEventListener('click', () => {
            count = 0;
            render();
         });

         render();
`);

   const readme = [
      `# ${title}`,
      '',
      '本目录由 `qpc init` 生成，包含出题所需的全部文件。',
      '',
      '## 目录结构',
      '',
      FENCE,
      'problem.config.ts   题目配置（标题、难度、标签、运行命令）',
      'judge.js            判题脚本（真源；判分逻辑都在这里）',
      'template/           答案模板：学生从这里开始，通常拿低分',
      'answer/             参考解：必须拿满分，首屏截图会当作封面',
      FENCE,
      '',
      '## 标准流程',
      '',
      `${FENCE}bash`,
      '# 1. 本地预检（毫秒级，先挡掉静态错误）',
      'qpc check',
      '',
      '# 2. 上传并等待审计（生成题目版本，审计约 20 秒）',
      'qpc upload --wait',
      '',
      '# 3. 审计通过后发布',
      'qpc publish <problemId>',
      FENCE,
      '',
      '## 需要人工确认的事（预检覆盖不到）',
      '',
      '- [ ] 参考解真的能拿满分（看 `qpc upload --wait` 的检查点明细）',
      '- [ ] 答案模板明显低分（证明判题能抓错）',
      '- [ ] 断言消息写清"期望 vs 实际"（预检只做启发式提醒）',
      '- [ ] 封面好看（默认封面 = 参考解首屏截图）',
      '',
      '更完整的踩坑清单见仓库 `docs/PROBLEM_AUTHORING.md`。',
   ].join('\n');

   const gitignore = [
      'node_modules/',
      'dist/',
      '# qpc 的本地缓存（预检产物、审计快照）',
      '.qpc/',
      '.DS_Store',
   ].join('\n');

   return [
      { path: 'problem.config.ts', content: config },
      { path: 'judge.js', content: judge },
      { path: 'template/index.html', content: templateHtml },
      { path: 'answer/index.html', content: answerHtml },
      { path: 'README.md', content: `${readme}\n` },
      { path: '.gitignore', content: `${gitignore}\n` },
   ];
};
