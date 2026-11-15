import { DEFAULT_EDITOR_CONFIG, type EditorConfig } from '../_configs';
import type * as monaco from 'monaco-editor';
import {
   MOBILE_DEFAULT_FONT_SIZE,
   isTouchDevice,
} from '~/composables/monaco-mobile-support';

interface IUseEditorConfigOptions {
   onEditorInstanceReady: (
      callback: (instance: monaco.editor.IStandaloneCodeEditor) => void
   ) => void;
}

export const useEditorConfig = (options: IUseEditorConfigOptions) => {
   const { onEditorInstanceReady } = options;

   // SSR 和客户端水合使用相同默认值，挂载后再恢复本地偏好。
   const editorConfig = useLocalStorage<EditorConfig>(
      'editor-config',
      { ...DEFAULT_EDITOR_CONFIG },
      { initOnMounted: true, mergeDefaults: true }
   );

   // 触屏设备且用户未自定义字号时，保留移动端默认字号
   const resolveFontSize = (fontSize: number) =>
      isTouchDevice() && fontSize === DEFAULT_EDITOR_CONFIG.fontSize
         ? MOBILE_DEFAULT_FONT_SIZE
         : fontSize;

   let instance: monaco.editor.IStandaloneCodeEditor | undefined;
   let listener: monaco.IDisposable | undefined;
   const applyConfig = () => {
      if (!instance) return;
      const config = { ...DEFAULT_EDITOR_CONFIG, ...editorConfig.value };
      instance.updateOptions({
         fontSize: resolveFontSize(config.fontSize),
         fontFamily: config.fontFamily,
         lineHeight: config.lineHeight,
         wordWrap: config.wordWrap ? 'on' : 'off',
         minimap: { enabled: config.minimap },
         lineNumbers: config.lineNumbers,
         renderWhitespace: config.renderWhitespace,
         matchBrackets: config.matchBrackets ? 'always' : 'never',
         guides: { indentation: config.indentGuides },
         autoClosingBrackets: config.autoCloseBrackets ? 'languageDefined' : 'never',
         autoClosingQuotes: config.autoCloseQuotes ? 'languageDefined' : 'never',
         cursorStyle: config.cursorStyle,
         cursorBlinking: config.cursorBlinking,
         cursorSmoothCaretAnimation: config.cursorAnimation ? 'on' : 'off',
      });
      instance.getModel()?.updateOptions({
         tabSize: config.tabSize,
         insertSpaces: config.insertSpaces,
      });
   };
   watch(editorConfig, applyConfig, { deep: true });
   onEditorInstanceReady((readyInstance) => {
      instance = readyInstance;
      listener = instance.onDidChangeModel(applyConfig);
      applyConfig();
   });
   onUnmounted(() => listener?.dispose());

   return { editorConfig };
};
