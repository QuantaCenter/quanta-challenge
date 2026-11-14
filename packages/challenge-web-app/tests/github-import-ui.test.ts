import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import * as Vue from 'vue';
import { parse, compileScript } from 'vue/compiler-sfc';
import { renderToString } from 'vue/server-renderer';

const require = createRequire(import.meta.url);
const transpile = (source: string) => ts.transpileModule(source, {
   compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

test('polling starts only for importing projects, retries errors, stops when done and on disposal', async () => {
   const source = await readFile(new URL('../app/composables/use-workshop-projects.ts', import.meta.url), 'utf8');
   const exports = {};
   const projects = Vue.ref([{ id: 'demo', importStatus: 'ready' }]);
   const timers = new Map<number, () => Promise<void>>();
   let timerId = 0;
   let requests = 0;
   let fail = false;
   let status = 'importing';
   const query = async () => {
      requests++;
      if (fail) throw new Error('temporary network error');
      return [{ id: 'demo', importStatus: status }];
   };
   const asyncData = Object.assign(Promise.resolve(), {
      data: projects, pending: Vue.ref(false), error: Vue.ref(null), refresh: async () => {},
   });
   // Execute the real composable with Nuxt auto-imports and the clock injected.
   const factory = new Function('Vue', 'useNuxtApp', 'useMessage', 'useAsyncData', 'setTimeout', 'clearTimeout', 'exports', `
      const { computed, watch, onScopeDispose } = Vue;
      ${transpile(source.replace(/^import .*;$/gm, '').replaceAll('import.meta.client', 'true'))}
      return exports.useWorkshopProjects;
   `);
   const useProjects = factory(Vue, () => ({ $trpc: { protected: { workshop: { list: { query } } } } }),
      () => ({}), () => asyncData,
      (callback: () => Promise<void>, delay: number) => {
         assert.equal(delay, 3000);
         timers.set(++timerId, callback);
         return timerId;
      }, (id: number) => timers.delete(id), exports);
   const scope = Vue.effectScope();
   scope.run(() => useProjects());
   const tick = async () => {
      assert.equal(timers.size, 1);
      const [id, callback] = [...timers][0]!;
      timers.delete(id);
      await callback();
      await Vue.nextTick();
   };
   try {
      assert.equal(timers.size, 0);
      assert.equal(requests, 0);
      projects.value[0]!.importStatus = 'importing';
      await Vue.nextTick();
      await tick();
      assert.equal(requests, 1);
      assert.equal(timers.size, 1);
      fail = true;
      await tick();
      assert.equal(projects.value[0]!.importStatus, 'importing');
      assert.equal(timers.size, 1, 'transient errors keep polling');
      fail = false;
      status = 'failed';
      await tick();
      assert.equal(timers.size, 0, 'failed imports also stop polling');
      projects.value[0]!.importStatus = 'importing';
      await Vue.nextTick();
      status = 'ready';
      await tick();
      assert.equal(timers.size, 0);
      projects.value[0]!.importStatus = 'importing';
      await Vue.nextTick();
      assert.equal(timers.size, 1);
   } finally {
      scope.stop();
   }
   assert.equal(timers.size, 0, 'leaving the page cancels the timer');
});

test('only completed project cards render an IDE link', async () => {
   const filename = new URL('../app/pages/app/workshop/_components/ProjectCard.vue', import.meta.url);
   const { descriptor } = parse(await readFile(filename, 'utf8'));
   const compiled = compileScript(descriptor, { id: 'project-card-test', inlineTemplate: true });
   const exports = {} as { default: Vue.Component };
   new Function('require', 'exports', 'computed', transpile(compiled.content))(
      (id: string) => id === '~/utils/format-file-size' ? { formatFileSize: () => '0 B' } : require(id),
      exports, Vue.computed,
   );
   const project = {
      id: 'demo', name: 'Demo', source: 'github', sizeBytes: 0, updatedAt: new Date(),
      createdAt: new Date('2026-11-01T00:00:00Z'),
      description: 'A repository', importError: '下载失败',
      githubImport: { ownerLogin: 'test', repositoryName: 'demo', branchName: 'main', commitSha: null },
   };
   const render = async (importStatus: string) => {
      const app = Vue.createSSRApp(exports.default, { project: { ...project, importStatus } });
      const container = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h('div', slots.default?.()) });
      for (const name of ['StCard', 'StSpace', 'StPopover']) app.component(name, container);
      return renderToString(app);
   };
   const importing = await render('importing');
   assert.match(importing, /正在导入中/);
   assert.match(importing, /GitHub · test\/demo/);
   assert.match(importing, /animate-spin/);
   assert.match(importing, /创建/);
   assert.match(importing, /cursor-not-allowed/);
   assert.doesNotMatch(importing, /hover:ring-secondary/);
   assert.doesNotMatch(importing, /href=|A repository|0 B/);
   const failed = await render('failed');
   assert.match(failed, /导入失败：下载失败/);
   assert.match(failed, /GitHub · test\/demo/);
   assert.doesNotMatch(failed, /href=/);
   const ready = await render('ready');
   assert.match(ready, /href="\/workshop\/demo"/);
   assert.match(ready, /hover:ring-secondary/);
});
