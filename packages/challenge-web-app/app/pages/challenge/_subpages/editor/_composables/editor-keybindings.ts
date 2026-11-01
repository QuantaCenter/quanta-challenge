export const shortcutActions = [
   { id: 's', label: '保存提示', description: '代码自动同步到云端' },
   { id: 'r', label: '刷新预览', description: '重新加载预览页面' },
   { id: 'w', label: '关闭当前标签', description: '关闭当前打开的文件' },
   { id: 'j', label: '切换终端', description: '展开或收起终端面板' },
];

export const defaultKeybindings: Record<string, string> = {
   s: 'Mod+S',
   r: 'Mod+R',
   w: 'Mod+W',
   j: 'Mod+J',
};

export const shortcutRecording = ref(false);

export const keyFromEvent = (event: KeyboardEvent) => {
   if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return '';
   const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
   const key = event.key === ' ' ? 'Space' : event.key === '+' ? 'Plus' : event.key.toUpperCase();
   return [
      (isMac ? event.metaKey : event.ctrlKey) ? 'Mod' : '',
      isMac && event.ctrlKey ? 'Control' : '',
      !isMac && event.metaKey ? 'Meta' : '',
      event.altKey ? 'Alt' : '',
      event.shiftKey ? 'Shift' : '',
      key,
   ]
      .filter(Boolean)
      .join('+');
};

export const useEditorKeybindings = () =>
   useLocalStorage<Record<string, string>>(
      'editor-keybindings',
      { ...defaultKeybindings },
      { mergeDefaults: true },
   );
