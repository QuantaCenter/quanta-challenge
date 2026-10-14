import {
   initialize,
   TypeScriptWorker,
} from 'monaco-editor/esm/vs/language/typescript/ts.worker';

/**
 * Monaco 内置 TS 服务的 worker，只服务 simple editor 的 inmemory:// 模型。
 * 答题页的 file:// 模型由 Volar worker 负责，内置服务若也处理会出现重复补全与误报诊断。
 * 空结果沿用内置 worker 对 lib 文件的返回约定，主线程的各个 adapter 都能正确处理。
 */
const isVolarFile = (fileName: unknown) =>
   typeof fileName === 'string' && fileName.startsWith('file:///');

const emptyResults: Record<string, () => unknown> = {
   getSyntacticDiagnostics: () => [],
   getSemanticDiagnostics: () => [],
   getSuggestionDiagnostics: () => [],
   getCompilerOptionsDiagnostics: () => [],
   getFormattingEditsForDocument: () => [],
   getFormattingEditsForRange: () => [],
   getFormattingEditsAfterKeystroke: () => [],
   getCodeFixesAtPosition: () => [],
   provideInlayHints: () => [],
   getCompletionsAtPosition: () => undefined,
   getCompletionEntryDetails: () => undefined,
   getSignatureHelpItems: () => undefined,
   getQuickInfoAtPosition: () => undefined,
   getDocumentHighlights: () => undefined,
   getDefinitionAtPosition: () => undefined,
   getReferencesAtPosition: () => undefined,
   getNavigationTree: () => undefined,
   findRenameLocations: () => undefined,
   getRenameInfo: () => ({ canRename: false, localizedErrorMessage: '' }),
   getEmitOutput: () => ({ outputFiles: [], emitSkipped: true }),
};

class ScopedTypeScriptWorker extends TypeScriptWorker {
   override getScriptFileNames() {
      return super.getScriptFileNames().filter((name) => !isVolarFile(name));
   }
}

const proto = ScopedTypeScriptWorker.prototype as unknown as Record<
   string,
   (...args: unknown[]) => unknown
>;
for (const [method, empty] of Object.entries(emptyResults)) {
   const original = proto[method]!;
   proto[method] = function (this: unknown, fileName: unknown, ...rest: unknown[]) {
      if (isVolarFile(fileName)) return Promise.resolve(empty());
      return original.call(this, fileName, ...rest);
   };
}

self.onmessage = () => {
   initialize(
      (ctx: unknown, createData: unknown) =>
         new ScopedTypeScriptWorker(ctx, createData)
   );
};
