import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import * as Vue from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import * as pathUtils from '../app/utils/path-utils.ts';
import * as snapshotPreview from '../app/utils/snapshot-preview.ts';
import { getProjectModelPaths } from '../app/utils/project-model-files.ts';
import { IGNORE_FILE_PATTERNS } from '../app/pages/challenge/_subpages/editor/_configs/index.ts';

const require = createRequire(import.meta.url);
const filename = new URL('../app/pages/challenge/_subpages/editor/_modules/CodeEditorPanel.vue', import.meta.url);
const { descriptor } = parse(await readFile(filename, 'utf8'));
const compiled = compileScript(descriptor, { id: 'editor-initial-file-test' });
const script = ts.transpileModule(compiled.content, {
   compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

type FileMap = Record<string, { vid: string; content: string }>;
const htmlPath = '/project/index.html';
const html = '<h1>Initial project content</h1>';
const files = (): FileMap => ({ [htmlPath]: { vid: '', content: html } });

// Mount the real panel setup without a DOM; control Monaco readiness independently
// of Vue prop updates to exercise the first-open races deterministically.
const mountPanel = (initial: { currentFilePath?: string; defaultFs?: FileMap } = {}) => {
   const state = Vue.reactive({ currentFilePath: undefined as string | undefined, defaultFs: undefined as FileMap | undefined, ...initial });
   const models = new Map<string, ReturnType<typeof createModel>>();
   const createModel = (content: string, _language: unknown, uri: { path: string }) => {
      let disposed = false;
      const model = {
         uri, getValue: () => content, getVersionId: () => 1, getAlternativeVersionId: () => 1,
         isDisposed: () => disposed,
         dispose: () => { disposed = true; models.delete(uri.path); },
      };
      models.set(uri.path, model);
      return model;
   };
   type Model = ReturnType<typeof createModel>;
   let active: Model | null = null;
   let switches = 0;
   let ready = false;
   let editorOptions: { options?: { model?: Model | null } } | undefined;
   const instance = {
      getModel: () => active,
      setModel: (model: Model | null) => { active = model; switches++; },
      onDidChangeModelContent: () => {}, onDidChangeModel: () => {},
   };
   const monaco = {
      Uri: { file: (path: string) => ({ path }) },
      editor: { getModel: (uri: { path: string }) => models.get(uri.path), createModel },
   };
   const callbacks: Array<(instance: unknown, monaco: unknown) => void> = [];
   const useMonacoEditor = (options: typeof editorOptions) => {
      editorOptions = options;
      return {
         containerKey: 'editor',
         onEditorInstanceReady: (callback: typeof callbacks[number]) => {
            if (ready) callback(instance, monaco);
            else callbacks.push(callback);
         },
         createModels: (fs: Record<string, string>) => {
            for (const [path, content] of Object.entries(fs)) {
               if (!models.has(path)) createModel(content, undefined, { path });
            }
         },
         onModelChange: () => {}, onModelContentChange: () => {}, addExtraLibs: () => {},
      };
   };
   const mocks: Record<string, unknown> = {
      '../../../_composables/use-monaco-editor': { useMonacoEditor },
      '~/utils/path-utils': pathUtils,
      '~/utils/project-model-files': { getProjectModelPaths },
      '~/utils/snapshot-preview': snapshotPreview,
      '~/utils/project-search': {},
      '../_configs': { IGNORE_FILE_PATTERNS },
      '../_composables/use-editor-config': { useEditorConfig: () => ({ editorConfig: {} }) },
      '../_composables/use-listen-file-changes': { useListenFileChanges: () => {} },
      '~/components/st/Message/use-message': { useMessage: () => ({}) },
      '@icon-park/vue-next': {}, 'lucide-vue-next': {},
   };
   const exports = {} as { default: Vue.Component };
   new Function('require', 'exports', 'Vue', 'useEventListener', 'useEventBus', 'useMobileEditorHistory', 'useEditorStore', `
      const { ref, computed, watch, nextTick, onUnmounted } = Vue;
      ${script}
   `)(
      (id: string) => id in mocks ? mocks[id] : id.endsWith('.vue') ? {} : require(id),
      exports, Vue, () => {}, () => ({ on: () => {} }),
      () => ({ actions: Vue.ref(null), canUndo: Vue.ref(false), canRedo: Vue.ref(false) }),
      () => ({}),
   );
   const panel = Vue.ref();
   const renderer = Vue.createRenderer({
      createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      insert: () => {}, remove: () => {}, patchProp: () => {},
      setText: () => {}, setComment: () => {}, setElementText: () => {},
      parentNode: () => null, nextSibling: () => null,
   });
   const Panel = { ...exports.default, render: () => null };
   const app = renderer.createApp({
      setup: () => () => Vue.h(Panel, {
         ...state, ref: panel,
         'onUpdate:currentFilePath': (path: string) => { state.currentFilePath = path; },
         getWcInstance: async () => ({}), loadFile: async () => '', saveReplacement: async () => {},
      }),
   });
   app.mount({});
   return {
      state, models, panel,
      activeModel: () => active,
      switches: () => switches,
      ready: async () => {
         // Monaco creates an empty, anonymous model unless model: null is passed.
         active = editorOptions?.options?.model === null
            ? null : createModel('', undefined, { path: '/anonymous-model' });
         ready = true;
         callbacks.forEach((callback) => callback(instance, monaco));
         await Vue.nextTick();
      },
      unmount: () => app.unmount(),
   };
};

test('opens the selected project file when files arrive before Monaco is ready', async (t) => {
   const panel = mountPanel({ currentFilePath: htmlPath, defaultFs: files() });
   t.after(panel.unmount);
   await panel.ready();
   assert.equal(panel.activeModel()?.uri.path, htmlPath);
   assert.equal(panel.activeModel()?.getValue(), html);
});

test('opens the initial file when the project arrives after Monaco is ready', async (t) => {
   const panel = mountPanel();
   t.after(panel.unmount);
   await panel.ready();
   panel.state.defaultFs = files();
   panel.state.currentFilePath = htmlPath;
   await Vue.nextTick();
   assert.equal(panel.activeModel()?.getValue(), html);
});

test('opens a later selection even when the project file list does not change', async (t) => {
   const panel = mountPanel({ defaultFs: files() });
   t.after(panel.unmount);
   await panel.ready();
   panel.state.currentFilePath = 'project/index.html';
   await Vue.nextTick();
   assert.equal(panel.activeModel()?.uri.path, htmlPath);
   assert.equal(panel.activeModel()?.getValue(), html);
});

test('waits for selected file content and opens empty files excluded from preloading', async (t) => {
   const path = '/project/ignored.txt';
   const panel = mountPanel({
      currentFilePath: path,
      defaultFs: { '/project/.gitignore': { vid: '', content: 'ignored.txt' } },
   });
   t.after(panel.unmount);
   await panel.ready();
   assert.equal(panel.models.has(path), false);
   panel.state.defaultFs![path] = { vid: '', content: '' };
   await Vue.nextTick();
   assert.equal(panel.activeModel()?.uri.path, path);
   assert.equal(panel.activeModel()?.getValue(), '');
});

test('keeps binary files out of Monaco when selected on first open', async (t) => {
   const path = '/project/image.png';
   const panel = mountPanel({
      currentFilePath: path,
      defaultFs: { [path]: { vid: '', content: 'data:image/png;base64,iVBORw0KGgo=' } },
   });
   t.after(panel.unmount);
   await panel.ready();
   assert.equal(panel.activeModel(), null);
   assert.equal(panel.models.has(path), false);
});

test('snapshot edits and background preloading do not switch models or leave search', async (t) => {
   const panel = mountPanel({ currentFilePath: htmlPath, defaultFs: files() });
   t.after(panel.unmount);
   await panel.ready();
   panel.panel.value.openProjectSearch();
   const switches = panel.switches();
   panel.state.defaultFs![htmlPath]!.content = '<h1>Updated snapshot</h1>';
   panel.state.defaultFs!['/project/script.js'] = { vid: '', content: 'console.log(1)' };
   await Vue.nextTick();
   assert.equal(panel.panel.value.$.setupState.searchTabActive, true);
   assert.equal(panel.switches(), switches);
   assert.equal(panel.activeModel()?.getValue(), html, 'reuse the existing model instead of replacing its content');
   assert.equal(panel.models.has('/project/script.js'), true);
});

test('closing the last tab keeps the editor empty during background preloading', async (t) => {
   const panel = mountPanel({ currentFilePath: htmlPath, defaultFs: files() });
   t.after(panel.unmount);
   await panel.ready();
   panel.panel.value.closeCurrentTab();
   await Vue.nextTick();
   await Vue.nextTick();
   panel.state.defaultFs!['/project/script.js'] = { vid: '', content: 'console.log(1)' };
   await Vue.nextTick();
   assert.equal(panel.state.currentFilePath, '');
   assert.equal(panel.activeModel(), null);
});
