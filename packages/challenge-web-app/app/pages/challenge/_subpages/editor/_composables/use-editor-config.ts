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

   // 编辑器配置（使用默认值）
   const editorConfig = useLocalStorage<EditorConfig>('editor-config', {
      ...DEFAULT_EDITOR_CONFIG,
   });

   // 触屏设备且用户未自定义字号时，保留移动端默认字号
   const resolveFontSize = (fontSize: number) =>
      isTouchDevice() && fontSize === DEFAULT_EDITOR_CONFIG.fontSize
         ? MOBILE_DEFAULT_FONT_SIZE
         : fontSize;

   // 旧版本只保存了字号，合并默认值以兼容已有配置。
   editorConfig.value = { ...DEFAULT_EDITOR_CONFIG, ...editorConfig.value };

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
