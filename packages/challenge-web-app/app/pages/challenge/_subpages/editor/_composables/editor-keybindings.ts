export const shortcutActions = [
   { id: 's', label: '保存提示', description: '代码自动同步到云端' },
   { id: 'r', label: '刷新预览', description: '重新加载预览页面' },
   { id: 'w', label: '关闭当前标签', description: '关闭当前打开的文件' },
   { id: 'b', label: '切换文件栏', description: '显示或隐藏文件栏' },
   { id: 'j', label: '切换终端', description: '显示或隐藏终端面板' },
   { id: 'format', label: '格式化代码', description: '格式化当前文件' },
   { id: 'search', label: '全局搜索', description: '在所有项目文本文件中搜索' },
   { id: 'quickOpen', label: '搜索文件', description: '按文件名或路径快速打开文件' },
];

export const defaultKeybindings: Record<string, string> = {
   s: 'Mod+S',
   r: 'Mod+R',
   w: 'Mod+W',
   b: 'Mod+B',
   j: 'Mod+J',
   format: 'Alt+Shift+F',
   search: 'Mod+Shift+F',
   quickOpen: 'Mod+P',
};

export const shortcutRecording = ref(false);

export const keyFromEvent = (event: KeyboardEvent) => {
   if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return '';
   const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
   const key = event.altKey && /^Key[A-Z]$/.test(event.code)
      ? event.code.slice(3)
      : event.key === ' ' ? 'Space' : event.key === '+' ? 'Plus' : event.key.toUpperCase();
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

export const useEditorKeybindings = () => {
   const bindings = useLocalStorage<Record<string, string>>(
      'editor-keybindings',
      { ...defaultKeybindings },
      { mergeDefaults: true },
   );
   // Migrate the former default so it does not shadow project search for existing users.
   if (bindings.value.format === 'Mod+Shift+F' && bindings.value.search === 'Mod+Shift+F') {
      bindings.value.format = defaultKeybindings.format;
   }
   return bindings;
};
