import type monaco from 'monaco-editor';
import {
   getActiveMonacoTheme,
   markMonacoThemeActive,
} from './monaco-state';
import {
   applyMobileTouchSupport,
   getMobileEditorOptions,
   isTouchDevice,
} from './monaco-mobile-support';

export interface IUseSimpleEditorOptions {
   script: string;
   language?: string;
   options?: monaco.editor.IStandaloneEditorConstructionOptions;
   imports?: string[];
   containerRef?: string;
}

type EditorReadyCallback = (
   editor: monaco.editor.IStandaloneCodeEditor,
   monaco: typeof import('monaco-editor')
) => void;

type EditorDisposedCallback = (
   editor: monaco.editor.IStandaloneCodeEditor
) => void;

type EditorContentChangedCallback = (content: string) => void;

/** 定义并启用 simple editor 主题；全局已设置过主题时不再改动。 */
const applySimpleEditorTheme = (monaco: typeof import('monaco-editor')) => {
   if (getActiveMonacoTheme()) return;
   monaco.editor.defineTheme('custom-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
         'editor.background': '#1C1C1C',
      },
   });
   try {
      monaco.editor.setTheme('custom-theme');
      markMonacoThemeActive('custom-theme');
   } catch {
      // 主题已被其它插件接管时忽略
   }
};

const setEnvironment = () => {
   // 已有环境（例如答题页的 Volar worker）时不覆盖
   if (self.MonacoEnvironment?.getWorker) return;
   self.MonacoEnvironment = {
      getWorker: (_, label) => {
         if (label === 'typescript' || label === 'javascript') {
            return new Worker(
               new URL(
                  'monaco-editor/esm/vs/language/typescript/ts.worker.js',
                  import.meta.url
               ),
               { type: 'module' }
            );
         }
         return new Worker(
            new URL(
               'monaco-editor/esm/vs/editor/editor.worker.js',
               import.meta.url
            ),
            { type: 'module' }
         );
      },
   };
};

export const useSimpleEditor = (options: IUseSimpleEditorOptions) => {
   let editor: monaco.editor.IStandaloneCodeEditor | null = null;
   let monacoInstance: typeof import('monaco-editor') | null = null;
   let mobileTouchSupportDisposable: monaco.IDisposable | null = null;
   const containerKey = options.containerRef ?? 'container-key';
   const container = useTemplateRef<HTMLElement>(containerKey);

   const editorReadyCallbacks = new Set<EditorReadyCallback>();
   const onEditorReady = (callback: EditorReadyCallback) => {
      if (editor && monacoInstance) {
         callback(editor, monacoInstance);
      }
      editorReadyCallbacks.add(callback);
   };

   const editorBeforeDisposedCallbacks = new Set<EditorDisposedCallback>();
   const onBeforeEditorDisposed = (callback: EditorDisposedCallback) => {
      editorBeforeDisposedCallbacks.add(callback);
   };

   const editorContentChangedCallbacks =
      new Set<EditorContentChangedCallback>();
   const onEditorContentChanged = (callback: EditorContentChangedCallback) => {
      editorContentChangedCallbacks.add(callback);
   };

   const setEditorContent = (content: string) => {
      if (editor && editor.getValue() !== content) {
         editor.setValue(content);
         editorContentChangedCallbacks.forEach((callback) => callback(content));
      }
   };

   onMounted(async () => {
      if (!container.value) return;
      const monaco = await import('monaco-editor');
      monacoInstance = monaco;

      setEnvironment();

      // 已经配置过编译器选项（paths / typeRoots）时不覆盖
      const compilerOptions =
         monaco.languages.typescript.typescriptDefaults.getCompilerOptions();
      if (!compilerOptions.paths && !compilerOptions.typeRoots) {
         monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.ES2020,
            allowNonTsExtensions: true,
            moduleResolution:
               monaco.languages.typescript.ModuleResolutionKind.NodeJs,
            module: monaco.languages.typescript.ModuleKind.ESNext,
            strict: true,
            noEmit: true,
            importHelpers: true,
         });
      }

      options.imports?.forEach(async (importPath) => {
         const content = await fetch(importPath).then((res) => res.text());
         monaco.languages.typescript.typescriptDefaults.addExtraLib(content);
      });

      const createEditor = (el: HTMLElement) => {
         const model = monaco.editor.createModel(
            options.script,
            options.language ?? 'typescript'
         );
         const isTouch = isTouchDevice();
         editor = monaco.editor.create(el, {
            model,
            language: options.language ?? 'typescript',
            automaticLayout: true,
            fontSize: 16,
            autoClosingBrackets: 'always',
            minimap: { enabled: false },
            ...(isTouch && getMobileEditorOptions()),
            ...options.options,
         });
         if (isTouch && editor) {
            mobileTouchSupportDisposable = applyMobileTouchSupport(editor);
         }
         applySimpleEditorTheme(monaco);
      };

      createEditor(container.value);
      editorReadyCallbacks.forEach((callback) =>
         callback(editor!, monacoInstance!)
      );

      editor?.onDidChangeModelContent(() => {
         const content = editor?.getValue() ?? '';
         editorContentChangedCallbacks.forEach((callback) => callback(content));
      });
   });

   onUnmounted(() => {
      editorBeforeDisposedCallbacks.forEach((callback) => callback(editor!));
      mobileTouchSupportDisposable?.dispose();
      editor?.dispose();
   });

   return {
      getEditor: () => editor,
      containerKey,
      onEditorReady,
      onBeforeEditorDisposed,
      onEditorContentChanged,
      setEditorContent,
   };
};
