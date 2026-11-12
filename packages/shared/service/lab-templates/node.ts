import type { LabTemplate } from './types';

export const nodeTemplate: LabTemplate = {
   id: 'node',
   name: 'Node.js + Express',
   description: '在浏览器里运行的 Node.js 服务：Express 路由、JSON 接口与静态页面。',
   category: 'backend',
   tags: ['Node.js', 'Express', 'API'],
   icon: '/icons/nodejs.png',
   entry: 'server.js',
   installCommand: 'npm install',
   startCommand: 'npm run dev',
   readme: `# Node.js + Express

运行在 WebContainer 中的 Node.js 服务，监听 3000 端口，修改代码后自动重启（\`node --watch\`）。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | \`/api/todos\` | 获取待办列表 |
| POST | \`/api/todos\` | 新增待办，请求体 \`{ "text": "..." }\` |
| DELETE | \`/api/todos/:id\` | 删除待办 |

## 提示

- \`public/index.html\` 是一个调用上述接口的小页面，可以在预览区直接体验
- 也可以在终端里用 \`curl http://localhost:3000/api/todos\` 调试
`,
   files: {
      'package.json': `{
  "name": "express-lab",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch server.js",
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.21.2"
  }
}
`,
      'server.js': `import express from 'express';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

let nextId = 3;
let todos = [
   { id: 1, text: '在实验室里启动一个 Express 服务', done: true },
   { id: 2, text: '给接口加一个 PATCH 方法', done: false },
];

app.get('/api/todos', (req, res) => {
   res.json(todos);
});

app.post('/api/todos', (req, res) => {
   const text = String(req.body?.text ?? '').trim();
   if (!text) {
      return res.status(400).json({ message: 'text 不能为空' });
   }
   const todo = { id: nextId++, text, done: false };
   todos.push(todo);
   res.status(201).json(todo);
});

app.delete('/api/todos/:id', (req, res) => {
   const id = Number(req.params.id);
   todos = todos.filter((todo) => todo.id !== id);
   res.status(204).end();
});

app.listen(PORT, () => {
   console.log('Server is running at http://localhost:' + PORT);
});
`,
      'public/index.html': `<!doctype html>
<html lang="zh-CN">
   <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Express Todos</title>
      <style>
         :root {
            color-scheme: dark;
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
            background: #111111;
            color: #e5e5e5;
         }
         body { margin: 0; min-height: 100vh; display: grid; place-items: center; }
         .card { width: min(28rem, calc(100vw - 3rem)); padding: 2rem; border-radius: 1.25rem; background: #1f1f1f; border: 1px solid #272727; }
         .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 999px; background: rgba(95, 160, 78, 0.15); color: #7cc464; font-size: 0.75rem; }
         form { display: flex; gap: 0.5rem; margin: 1rem 0; }
         input { flex: 1; padding: 0.625rem 0.875rem; border-radius: 0.625rem; border: 1px solid #434343; background: #111111; color: inherit; outline: none; }
         button { padding: 0.625rem 1rem; border: none; border-radius: 0.625rem; background: #fa7c0e; color: #fff; cursor: pointer; }
         ul { padding: 0; list-style: none; }
         li { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #272727; }
         li button { background: transparent; color: #6d6d6d; padding: 0.25rem 0.5rem; }
         li button:hover { color: #fa2f32; }
      </style>
   </head>
   <body>
      <main class="card">
         <span class="badge">Express API</span>
         <h1>待办清单</h1>
         <form id="form">
            <input id="input" placeholder="添加一个待办事项" />
            <button type="submit">添加</button>
         </form>
         <ul id="list"></ul>
      </main>
      <script>
         const list = document.getElementById('list');
         const input = document.getElementById('input');

         async function load() {
            const todos = await fetch('/api/todos').then((res) => res.json());
            list.innerHTML = '';
            todos.forEach((todo) => {
               const li = document.createElement('li');
               li.textContent = todo.text;
               const remove = document.createElement('button');
               remove.textContent = '删除';
               remove.onclick = async () => {
                  await fetch('/api/todos/' + todo.id, { method: 'DELETE' });
                  load();
               };
               li.appendChild(remove);
               list.appendChild(li);
            });
         }

         document.getElementById('form').addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!input.value.trim()) return;
            await fetch('/api/todos', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ text: input.value }),
            });
            input.value = '';
            load();
         });

         load();
      </script>
   </body>
</html>
`,
   },
};
