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

   // 监听配置变化，实时更新编辑器
   watch(
      () => editorConfig.value.fontSize,
      (newFontSize) => {
         onEditorInstanceReady((instance) => {
            instance.updateOptions({
               fontSize: resolveFontSize(newFontSize),
            });
         });
      },
      { immediate: true }
   );

   return { editorConfig };
};
