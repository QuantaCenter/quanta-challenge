export interface IUseEditorShortcutsOptions {
   onSave: () => void;
   onRefreshPreview: () => void;
   onCloseTab: () => void;
   onToggleTerminal: () => void;
}

/**
 * 做题页快捷键：Ctrl/⌘ + S / R / W / J。
 *
 * 在 window 捕获阶段监听，抢在 Monaco、xterm 之前拦下浏览器默认行为。
 * 焦点在跨源的预览 iframe 内时事件到不了这里；Ctrl+W 在多数浏览器里属于保留快捷键，
 * 页面可能根本收不到。
 */
export const useEditorShortcuts = (options: IUseEditorShortcutsOptions) => {
   const handlers: Record<string, () => void> = {
      s: options.onSave,
      r: options.onRefreshPreview,
      w: options.onCloseTab,
      j: options.onToggleTerminal,
   };

   useEventListener(
      window,
      'keydown',
      (event: KeyboardEvent) => {
         if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) {
            return;
         }
         const handler = handlers[event.key.toLowerCase()];
         if (!handler) return;

         event.preventDefault();
         event.stopPropagation();
         if (!event.repeat) handler();
      },
      { capture: true },
   );
};
