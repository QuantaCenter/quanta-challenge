import type { LabTemplate } from './types';

export const reactTemplate: LabTemplate = {
   id: 'react',
   name: 'React',
   description: 'React 18 + Vite，函数组件与 Hooks，开箱即用的快速刷新。',
   category: 'framework',
   tags: ['React', 'JSX', 'Vite'],
   icon: '/icons/react.png',
   entry: 'src/App.jsx',
   installCommand: 'npm install',
   startCommand: 'npm run dev',
   readme: `# React 18

基于 Vite 的 React 项目，支持 Fast Refresh（保存即刷新且保留组件状态）。

## 目录

- \`src/App.jsx\`：根组件
- \`src/components/Clock.jsx\`：示例组件（useEffect 计时器）
- \`src/main.jsx\`：应用入口
`,
   files: {
      'package.json': `{
  "name": "react-lab",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^5.4.11"
  }
}
`,
      'vite.config.js': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
   plugins: [react()],
});
`,
      'index.html': `<!doctype html>
<html lang="zh-CN">
   <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>React Lab</title>
   </head>
   <body>
      <div id="root"></div>
      <script type="module" src="/src/main.jsx"></script>
   </body>
</html>
`,
      'src/main.jsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(
   <StrictMode>
      <App />
   </StrictMode>,
);
`,
      'src/App.jsx': `import { useState } from 'react';
import Clock from './components/Clock.jsx';

export default function App() {
   const [count, setCount] = useState(0);

   return (
      <main className="card">
         <span className="badge">React 18</span>
         <h1>你好，React</h1>
         <p>
            编辑 <code>src/App.jsx</code>，保存后组件会快速刷新并保留状态。
         </p>
         <button type="button" onClick={() => setCount((value) => value + 1)}>
            点击次数：{count}
         </button>
         <Clock />
      </main>
   );
}
`,
      'src/components/Clock.jsx': `import { useEffect, useState } from 'react';

export default function Clock() {
   const [now, setNow] = useState(() => new Date());

   useEffect(() => {
      const timer = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(timer);
   }, []);

   return (
      <section className="clock">
         <small>当前时间</small>
         <strong>{now.toLocaleTimeString('zh-CN', { hour12: false })}</strong>
      </section>
   );
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
   background: rgba(97, 218, 251, 0.12);
   color: #61dafb;
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
   padding: 0.75rem 1.25rem;
   border: none;
   border-radius: 0.75rem;
   background: #fa7c0e;
   color: #fff;
   font-size: 1rem;
   cursor: pointer;
}

.clock {
   margin-top: 1.5rem;
   padding: 1rem 1.25rem;
   border-radius: 0.875rem;
   background: #111111;
   display: flex;
   align-items: center;
   justify-content: space-between;
}

.clock small {
   color: #6d6d6d;
}

.clock strong {
   font-size: 1.5rem;
   font-variant-numeric: tabular-nums;
   color: #a6fb1d;
}
`,
   },
};
