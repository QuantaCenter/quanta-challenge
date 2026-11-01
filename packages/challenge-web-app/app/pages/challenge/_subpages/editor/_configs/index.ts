// 编辑器配置接口
export interface EditorConfig {
   fontSize: number;
   wordWrap: boolean;
   tabSize: number;
   insertSpaces: boolean;
   minimap: boolean;
   lineNumbers: 'on' | 'relative' | 'off';
}

// 默认配置值
export const DEFAULT_EDITOR_CONFIG: EditorConfig = {
   fontSize: 16,
   wordWrap: false,
   tabSize: 2,
   insertSpaces: true,
   minimap: false,
   lineNumbers: 'on',
};

export const DEFAULT_FILE_SYSTEM_SYNC_INTERVAL = 5 * 1000;

export const IGNORE_FILE_PATTERNS = [
   '**/node_modules/',
   '**/.git',
   '**/dist/',
   '**/.cache/',
   '**/.vite/',
   '**/.vite',
   '**/*.lock',
   'dist',
   '**/.quanta/**',
   '**/.quanta',
];
