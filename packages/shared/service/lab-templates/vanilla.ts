import type { LabTemplate } from './types';

export const vanillaTemplate: LabTemplate = {
   id: 'vanilla',
   name: 'Vite + JavaScript',
   description: '原生 JavaScript 搭配 Vite，支持 ES Module 与热更新。',
   category: 'basic',
   tags: ['Vite', 'JavaScript', 'HMR'],
   icon: '/icons/javascript.png',
   entry: 'src/main.js',
   installCommand: 'npm install',
   startCommand: 'npm run dev',
   readme: `# Vite + JavaScript

使用 Vite 驱动的原生 JavaScript 项目，保存即热更新。

## 常用命令

- \`npm run dev\`：启动开发服务器
- \`npm run build\`：构建生产产物
- \`npm install <包名>\`：在终端中安装依赖

## 目录

- \`index.html\`：入口页面
- \`src/main.js\`：入口脚本
- \`src/counter.js\`：示例模块
- \`src/style.css\`：全局样式
`,
   files: {
      'package.json': `{
  "name": "vite-vanilla-lab",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "vite": "^5.4.11"
  }
}
`,
      'index.html': `<!doctype html>
<html lang="zh-CN">
   <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Vite + JavaScript</title>
   </head>
   <body>
      <div id="app"></div>
      <script type="module" src="/src/main.js"></script>
   </body>
</html>
`,
      'src/main.js': `import './style.css';
import { setupCounter } from './counter.js';

document.querySelector('#app').innerHTML = \`
   <main class="card">
      <span class="badge">Vite + JavaScript</span>
      <h1>开始你的创作</h1>
      <p>编辑 <code>src/main.js</code>，保存后页面会自动热更新。</p>
      <button id="counter" type="button"></button>
   </main>
\`;

setupCounter(document.querySelector('#counter'));
`,
      'src/counter.js': `export function setupCounter(element) {
   let counter = 0;
   const setCounter = (count) => {
      counter = count;
      element.textContent = '点击次数：' + counter;
   };
   element.addEventListener('click', () => setCounter(counter + 1));
   setCounter(0);
}
`,
      'src/style.css': `:root {
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
   background: rgba(247, 223, 30, 0.12);
   color: #f7df1e;
   font-size: 0.75rem;
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
}
`,
   },
};
