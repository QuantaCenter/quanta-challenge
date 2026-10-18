import { useEventEmitter } from '~/composables/use-event-emitter';
import type { MonacoEditor } from '.';
import { CustomCodeEditorOpener } from './providers/editor-opener-impl';
import type * as monaco from 'monaco-editor';

/** 自定义代码编辑器打开器。 */
export const customizeEditorOpener = (
   monaco: MonacoEditor,
   instance: monaco.editor.IStandaloneCodeEditor,
   emitterKey: symbol
) => {
   const opener = new CustomCodeEditorOpener(monaco, instance);
   monaco.editor.registerEditorOpener(opener);
   const { emit } = useEventEmitter<{ path: string }>(
      emitterKey,
      'model-change'
   );
   opener.subscribeChange((path: string) => emit({ path }));
};
