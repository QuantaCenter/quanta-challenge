import {
   activateAutoInsertion,
   activateMarkers,
   registerProviders,
} from '@volar/monaco';
import * as languageConfigs from './language-configs';
import type { MonacoEditor } from '.';

// 导入 worker 文件
import vueWorkerUrl from './vue.worker?worker&url';
import tsWorkerUrl from './builtin-ts.worker?worker&url';
import jsonWorkerUrl from 'monaco-editor/esm/vs/language/json/json.worker?worker&url';
import cssWorkerUrl from 'monaco-editor/esm/vs/language/css/css.worker?worker&url';
import htmlWorkerUrl from 'monaco-editor/esm/vs/language/html/html.worker?worker&url';
import editorWorkerUrl from 'monaco-editor/esm/vs/editor/editor.worker?worker&url';

const createWorker = async (workerPath: string) => {
   return new Worker(workerPath, { type: 'module' });
};

export const registerLanguageWorkers = (
   monaco: MonacoEditor,
   getWorker?: (label: string) => Promise<Worker | undefined>
) => {
   self.MonacoEnvironment = {
      getWorker: async (_, label) => {
         const worker = getWorker ? await getWorker(label) : undefined;
         if (worker) return worker;

         if (label === 'json') {
            return await createWorker(jsonWorkerUrl);
         }
         if (label === 'typescript' || label === 'javascript') {
            return await createWorker(tsWorkerUrl);
         }
         if (label === 'css' || label === 'scss' || label === 'less') {
            return await createWorker(cssWorkerUrl);
         }
         if (label === 'html') {
            return await createWorker(htmlWorkerUrl);
         }
         if (label === 'vue') {
            return await createWorker(vueWorkerUrl);
         }
         return await createWorker(editorWorkerUrl);
      },
   };

   // 重新设置一次编译选项会让内置 TS 服务丢弃旧 worker，
   // 之前由 simple editor 的环境创建的 worker 并不会跳过答题页的 file:// 模型
   const { typescriptDefaults, javascriptDefaults } = monaco.languages.typescript;
   typescriptDefaults.setCompilerOptions(typescriptDefaults.getCompilerOptions());
   javascriptDefaults.setCompilerOptions(javascriptDefaults.getCompilerOptions());

   monaco.languages.setLanguageConfiguration(
      'vue',
      languageConfigs.vue(monaco)
   );
   monaco.languages.setLanguageConfiguration(
      'javascript',
      languageConfigs.js(monaco)
   );
   monaco.languages.setLanguageConfiguration(
      'typescript',
      languageConfigs.ts(monaco)
   );
   monaco.languages.setLanguageConfiguration(
      'css',
      languageConfigs.css(monaco)
   );
   monaco.languages.setLanguageConfiguration(
      'html',
      languageConfigs.html(monaco)
   );

   monaco.languages.register({
      id: 'vue',
      extensions: ['.vue'],
   });
   const worker = monaco.editor.createWebWorker({
      moduleId: 'vs/language/vue/vueWorker',
      label: 'vue',
   });

   // html 也交给 Volar：内置 HTML 服务不处理 <style> / <script> / style="" 里的内嵌语言
   const languageId = ['vue', 'typescript', 'javascript', 'html'];
   const htmlDefaults = monaco.languages.html.htmlDefaults;
   const htmlModeConfiguration = htmlDefaults.modeConfiguration;
   htmlDefaults.setModeConfiguration(
      Object.fromEntries(
         Object.keys(htmlModeConfiguration).map((key) => [key, false])
      )
   );

   const getSyncUris = () => {
      const res = monaco.editor.getModels().map((model) => model.uri);
      return res;
   };

   const disposables = [
      // @ts-ignore
      activateMarkers(worker, languageId, 'vue', getSyncUris, monaco.editor),
      // @ts-ignore
      activateAutoInsertion(worker, languageId, getSyncUris, monaco.editor),
   ];
   // @ts-ignore
   const providers = registerProviders(worker, languageId, getSyncUris, monaco.languages);

   const vueShimDts = `
    declare module '*.vue' {
        import type { DefineComponent } from 'vue'
        const component: DefineComponent<{}, {}, any>
        export default component
    }`;
   monaco.languages.typescript.typescriptDefaults.addExtraLib(
      vueShimDts,
      'file:///node_modules/vue-shim.d.ts'
   );

   return () => {
      disposables.forEach((disposable) => disposable.dispose());
      providers.then((disposable) => disposable.dispose());
      worker.dispose();
      htmlDefaults.setModeConfiguration(htmlModeConfiguration);
   };
};
