import type { LabTemplate } from './types';

export const vueTemplate: LabTemplate = {
   id: 'vue',
   name: 'Vue 3',
   description: 'Vue 3 + TypeScript + Vite，单文件组件与组合式 API。',
   category: 'framework',
   tags: ['Vue', 'TypeScript', 'Vite'],
   icon: '/icons/vue.png',
   entry: 'src/App.vue',
   installCommand: 'npm install',
   startCommand: 'npm run dev',
   readme: `# Vue 3 + TypeScript

基于 Vite 的 Vue 3 项目，使用 \`<script setup>\` 与组合式 API。

## 目录

- \`src/App.vue\`：根组件
- \`src/components/TodoList.vue\`：示例组件（待办清单）
- \`src/main.ts\`：应用入口

## 提示

- 编辑器内置 Vue 语言服务，支持模板补全与类型检查
- 在终端执行 \`npm install <包名>\` 安装依赖，类型会自动同步到编辑器
`,
   files: {
      'package.json': `{
  "name": "vue-lab",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.1",
    "vite": "^5.4.11"
  }
}
`,
      'vite.config.ts': `import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
   plugins: [vue()],
});
`,
      'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "skipLibCheck": true,
    "noEmit": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
`,
      'index.html': `<!doctype html>
<html lang="zh-CN">
   <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Vue 3 Lab</title>
   </head>
   <body>
      <div id="app"></div>
      <script type="module" src="/src/main.ts"></script>
   </body>
</html>
`,
      'src/env.d.ts': `/// <reference types="vite/client" />

declare module '*.vue' {
   import type { DefineComponent } from 'vue';
   const component: DefineComponent<object, object, unknown>;
   export default component;
}
`,
      'src/main.ts': `import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

createApp(App).mount('#app');
`,
      'src/App.vue': `<script setup lang="ts">
import { ref } from 'vue';
import TodoList from './components/TodoList.vue';

const count = ref(0);
</script>

<template>
   <main class="card">
      <span class="badge">Vue 3 + TypeScript</span>
      <h1>你好，Vue</h1>
      <p>编辑 <code>src/App.vue</code>，保存后页面会自动热更新。</p>
      <button type="button" @click="count++">点击次数：{{ count }}</button>
      <TodoList />
   </main>
</template>

<style scoped>
.badge {
   display: inline-block;
   padding: 0.25rem 0.75rem;
   border-radius: 999px;
   background: rgba(66, 184, 131, 0.15);
   color: #42b883;
   font-size: 0.75rem;
}
</style>
`,
      'src/components/TodoList.vue': `<script setup lang="ts">
import { computed, ref } from 'vue';

interface Todo {
   id: number;
   text: string;
   done: boolean;
}

const draft = ref('');
const todos = ref<Todo[]>([
   { id: 1, text: '阅读 Vue 文档', done: true },
   { id: 2, text: '在实验室里写一个组件', done: false },
]);

const remaining = computed(() => todos.value.filter((todo) => !todo.done).length);

const addTodo = () => {
   const text = draft.value.trim();
   if (!text) return;
   todos.value.push({ id: Date.now(), text, done: false });
   draft.value = '';
};
</script>

<template>
   <section class="todo">
      <form @submit.prevent="addTodo">
         <input v-model="draft" placeholder="添加一个待办事项" />
         <button type="submit">添加</button>
      </form>
      <ul>
         <li v-for="todo in todos" :key="todo.id" :class="{ done: todo.done }">
            <label>
               <input v-model="todo.done" type="checkbox" />
               {{ todo.text }}
            </label>
         </li>
      </ul>
      <small>剩余 {{ remaining }} 项未完成</small>
   </section>
</template>

<style scoped>
.todo {
   margin-top: 1.5rem;
   padding-top: 1.5rem;
   border-top: 1px solid #272727;
}

form {
   display: flex;
   gap: 0.5rem;
}

form input {
   flex: 1;
   padding: 0.625rem 0.875rem;
   border-radius: 0.625rem;
   border: 1px solid #434343;
   background: #111111;
   color: inherit;
   outline: none;
}

form input:focus {
   border-color: #fa7c0e;
}

form button {
   margin: 0;
}

ul {
   padding: 0;
   list-style: none;
}

li {
   padding: 0.5rem 0;
}

li.done label {
   color: #6d6d6d;
   text-decoration: line-through;
}

small {
   color: #6d6d6d;
}
</style>
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
   width: min(30rem, calc(100vw - 3rem));
   padding: 2rem;
   border-radius: 1.25rem;
   background: #1f1f1f;
   border: 1px solid #272727;
}

p {
   color: #9d9d9d;
   line-height: 1.6;
}

code {
   color: #a6fb1d;
}

button {
   margin-top: 0.5rem;
   padding: 0.625rem 1.125rem;
   border: none;
   border-radius: 0.625rem;
   background: #fa7c0e;
   color: #fff;
   font-size: 0.95rem;
   cursor: pointer;
}
`,
   },
};
