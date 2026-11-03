import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const vue = require('vue');
const { renderToString } = require('vue/server-renderer');
const playground = await import('../app/utils/markdown-playground.ts');
const source = await readFile(new URL('../app/composables/use-markdown.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
   compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
// 仅隔离高亮资源加载，模板引用、组件生命周期与 Markdown 解析使用真实实现。
runInNewContext(compiled, {
   exports,
   require(id) {
      if (id === './use-shiki') return { useShiki: () => ({ highlighter: vue.ref(null) }) };
      if (id.startsWith('shiki/')) return {};
      if (id === '~/utils/markdown-playground') return playground;
      return require(id);
   },
   ref: vue.ref,
   watch: vue.watch,
   onMounted: vue.onMounted,
   useId: vue.useId,
   useTemplateRef: vue.useTemplateRef,
});

test('同一组件两次创建 Markdown 实例不会重复注册引用，内容互不覆盖', async () => {
   const keys = [];
   const app = vue.createSSRApp({
      async setup() {
         const article = exports.useMarkdown({ codeHeader: true, playground: true });
         const problem = exports.useMarkdown({ codeHeader: true });
         keys.push(article.containerKey, problem.containerKey);
         await Promise.all([
            article.update('# 文章内容'),
            problem.update('# 题面内容'),
         ]);
         return () => vue.h('main', [
            vue.h('div', { ref: article.containerKey, innerHTML: article.html.value }),
            vue.h('div', { ref: problem.containerKey, innerHTML: problem.html.value }),
         ]);
      },
   });
   const html = await renderToString(app);
   assert.equal(new Set(keys).size, 2);
   assert.match(html, /文章内容/);
   assert.match(html, /题面内容/);
});
