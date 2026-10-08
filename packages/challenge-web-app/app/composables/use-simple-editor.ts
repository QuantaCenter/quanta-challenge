import type monaco from 'monaco-editor';

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

const setEnvironment = () => {
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

      options.imports?.forEach(async (importPath) => {
         const content = await fetch(importPath).then((res) => res.text());
         monaco.languages.typescript.typescriptDefaults.addExtraLib(content);
      });

      const createEditor = (el: HTMLElement) => {
         const model = monaco.editor.createModel(
            options.script,
            options.language ?? 'typescript'
         );
         editor = monaco.editor.create(el, {
            model,
            language: options.language ?? 'typescript',
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 16,
            autoClosingBrackets: 'always',
            minimap: { enabled: false },
            ...options.options,
         });
         monaco.editor.defineTheme('custom-theme', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
               'editor.background': '#1C1C1C',
            },
         });
         monaco.editor.setTheme('custom-theme');
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
