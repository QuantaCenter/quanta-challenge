import {
   activateAutoInsertion,
   activateMarkers,
   registerProviders,
} from '@volar/monaco';
import * as languageConfigs from './language-configs';
import type { WorkerLanguageService } from '@volar/monaco/worker';
import type {
   editor,
   IDisposable,
   IRange,
   languages,
   Uri,
} from 'monaco-editor';
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

interface LspRange {
   start: { line: number; character: number };
   end: { line: number; character: number };
}
interface LspTextEdit {
   range: LspRange;
   newText: string;
}

const toLspRange = (range: IRange): LspRange => ({
   start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
   end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
});
const toMonacoTextEdit = ({ range, newText }: LspTextEdit) => ({
   range: {
      startLineNumber: range.start.line + 1,
      startColumn: range.start.character + 1,
      endLineNumber: range.end.line + 1,
      endColumn: range.end.character + 1,
   },
   text: newText,
});

/** 修复 @volar/monaco 的 provideColorPresentations 恒返回 undefined（颜色选择器点选会抛错），替换为按颜色自身范围请求。 */
const withColorPresentationsFix = (
   monacoLanguages: MonacoEditor['languages'],
   worker: editor.MonacoWebWorker<WorkerLanguageService>,
   getSyncUris: () => Uri[]
): MonacoEditor['languages'] =>
   Object.create(monacoLanguages, {
      registerColorProvider: {
         value: (
            selector: languages.LanguageSelector,
            provider: languages.DocumentColorProvider
         ) =>
            monacoLanguages.registerColorProvider(selector, {
               ...provider,
               async provideColorPresentations(model, { color, range }) {
                  const service = await worker.withSyncedResources(
                     getSyncUris()
                  );
                  const presentations = await service.getColorPresentations(
                     0,
                     model.uri,
                     color,
                     toLspRange(range)
                  );
                  return (presentations ?? []).map((presentation) => ({
                     label: presentation.label,
                     textEdit:
                        presentation.textEdit &&
                        toMonacoTextEdit(presentation.textEdit),
                     additionalTextEdits:
                        presentation.additionalTextEdits?.map(toMonacoTextEdit),
                  }));
               },
            }),
      },
   });

/** 等基础语言包加载完再注册一次，保证我们的配置最后生效（basic-languages 异步加载后会覆盖同名字段导致误标红）；须用 Monaco 登记的 loader 而非自行 import。 */
const setLanguageConfigurationAfterBasic = (
   monaco: MonacoEditor,
   languageId: string,
   configuration: languages.LanguageConfiguration
): IDisposable => {
   const disposables = [
      monaco.languages.setLanguageConfiguration(languageId, configuration),
   ];
   const { loader } = (monaco.languages
      .getLanguages()
      .find((language) => language.id === languageId) ?? {}) as {
      loader?: () => Promise<unknown>;
   };
   let disposed = false;
   if (loader) {
      disposables.push(
         monaco.languages.onLanguageEncountered(languageId, async () => {
            await loader();
            await new Promise((resolve) => setTimeout(resolve));
            if (disposed) return;
            disposables.push(
               monaco.languages.setLanguageConfiguration(languageId, configuration)
            );
         })
      );
   }
   return {
      dispose() {
         disposed = true;
         disposables.forEach((disposable) => disposable.dispose());
      },
   };
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

   const languageConfigDisposables = (
      [
         ['vue', languageConfigs.vue],
         ['javascript', languageConfigs.js],
         ['typescript', languageConfigs.ts],
         ['css', languageConfigs.css],
         ['postcss', languageConfigs.css],
         ['scss', languageConfigs.cssPreprocessor],
         ['less', languageConfigs.cssPreprocessor],
         ['sass', languageConfigs.cssPreprocessor],
         ['stylus', languageConfigs.cssPreprocessor],
         ['html', languageConfigs.html],
      ] as const
   ).map(([id, createConfig]) =>
      setLanguageConfigurationAfterBasic(monaco, id, createConfig(monaco))
   );

   monaco.languages.register({
      id: 'vue',
      extensions: ['.vue'],
   });
   const worker = monaco.editor.createWebWorker<WorkerLanguageService>({
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
   const providers = registerProviders(
      worker,
      languageId,
      getSyncUris,
      withColorPresentationsFix(monaco.languages, worker, getSyncUris)
   );

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
      languageConfigDisposables.forEach((disposable) => disposable.dispose());
      providers.then((disposable) => disposable.dispose());
      worker.dispose();
      htmlDefaults.setModeConfiguration(htmlModeConfiguration);
   };
};
