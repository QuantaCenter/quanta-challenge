import {
   useEditorKeybindings,
   keyFromEvent,
   shortcutRecording,
} from './editor-keybindings';

export interface IUseEditorShortcutsOptions {
   onSave: () => void;
   onRefreshPreview: () => void;
   onCloseTab: () => void;
   onToggleFiles: () => void;
   onToggleTerminal: () => void;
   onFormat: () => void;
}

/**
 * 做题页快捷键：Ctrl/⌘ + S / R / W / B / J。
 *
 * 在 window 捕获阶段监听，抢在 Monaco、xterm 之前拦下浏览器默认行为。
 * 焦点在跨源的预览 iframe 内时事件到不了这里；Ctrl+W 在多数浏览器里属于保留快捷键，
 * 页面可能根本收不到。
 */
export const useEditorShortcuts = (options: IUseEditorShortcutsOptions) => {
   const bindings = useEditorKeybindings();
   const handlers: Record<string, () => void> = {
      s: options.onSave,
      r: options.onRefreshPreview,
      w: options.onCloseTab,
      b: options.onToggleFiles,
      j: options.onToggleTerminal,
      format: options.onFormat,
   };

   useEventListener(
      window,
      'keydown',
      (event: KeyboardEvent) => {
         if (shortcutRecording.value) return;
         if (event.isComposing) return;
         const key = keyFromEvent(event);
         if (!key) return;
         const target = event.target;
         if (
            !event.ctrlKey && !event.metaKey && !event.altKey &&
            target instanceof HTMLElement &&
            (target.isContentEditable || target.closest('input, textarea, [contenteditable="true"]'))
         ) return;
         const action = Object.keys(bindings.value).find(
            (id) => bindings.value[id] === key,
         );
         const handler = action ? handlers[action] : undefined;
         if (!handler) return;

         event.preventDefault();
         event.stopPropagation();
         if (!event.repeat) handler();
      },
      { capture: true },
   );
};
