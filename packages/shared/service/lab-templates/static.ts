import type { LabTemplate } from './types';

export const staticTemplate: LabTemplate = {
   id: 'static',
   name: 'HTML / CSS / JS',
   description: '无需构建的静态页面，启动最快，适合练习基础语法与 DOM 操作。',
   category: 'basic',
   tags: ['HTML', 'CSS', 'JavaScript'],
   icon: '/icons/html.png',
   entry: 'index.html',
   startCommand: 'npx --yes serve -l 3000 .',
   readme: `# HTML / CSS / JS

一个不依赖任何构建工具的静态页面模板，使用 \`serve\` 在 3000 端口提供静态服务。

## 目录

- \`index.html\`：页面结构
- \`style.css\`：样式
- \`script.js\`：交互逻辑

## 提示

- 修改文件后，在预览区点击刷新（或按 Ctrl / ⌘ + R）即可看到效果
- 预览区右上角的「控制台」按钮可以查看 \`console.log\` 输出
`,
   files: {
      'index.html': `<!doctype html>
<html lang="zh-CN">
   <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Quanta Lab</title>
      <link rel="stylesheet" href="./style.css" />
   </head>
   <body>
      <main class="card">
         <span class="badge">Quanta Lab</span>
         <h1>你好，Quanta</h1>
         <p>编辑 <code>index.html</code>、<code>style.css</code> 与 <code>script.js</code>，然后刷新预览。</p>
         <button id="counter" type="button">点击次数：0</button>
      </main>
      <script src="./script.js"></script>
   </body>
</html>
`,
      'style.css': `:root {
   color-scheme: dark;
   font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
   background: #111111;
   color: #e5e5e5;
}

body {
   margin: 0;
   min-height: 100vh;
   display: grid;
   place-items: center;
}

.card {
   width: min(28rem, calc(100vw - 3rem));
   padding: 2rem;
   border-radius: 1.25rem;
   background: #1f1f1f;
   border: 1px solid #272727;
}

.badge {
   display: inline-block;
   padding: 0.25rem 0.75rem;
   border-radius: 999px;
   background: rgba(250, 124, 14, 0.15);
   color: #fa7c0e;
   font-size: 0.75rem;
}

h1 {
   margin: 1rem 0 0.5rem;
}

p {
   color: #9d9d9d;
   line-height: 1.6;
}

code {
   color: #a6fb1d;
}

button {
   margin-top: 1rem;
   padding: 0.75rem 1.25rem;
   border: none;
   border-radius: 0.75rem;
   background: #fa7c0e;
   color: #fff;
   font-size: 1rem;
   cursor: pointer;
   transition: transform 0.15s ease;
}

button:active {
   transform: scale(0.97);
}
`,
      'script.js': `const button = document.querySelector('#counter');
let count = 0;

button.addEventListener('click', () => {
   count += 1;
   button.textContent = '点击次数：' + count;
   console.log('clicked', count);
});
`,
   },
};
