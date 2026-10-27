// 编辑器配置接口
export interface EditorConfig {
   fontSize: number;
}

// 默认配置值
export const DEFAULT_EDITOR_CONFIG: EditorConfig = {
   fontSize: 16,
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
