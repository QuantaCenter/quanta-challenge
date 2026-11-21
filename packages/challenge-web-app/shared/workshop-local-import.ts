export const WORKSHOP_LOCAL_IMPORT_MAX_FILES = 5000;

export const getLocalImportRequestLimit = (maxProjectBytes: number) =>
   // 为 UTF-8 相对路径、JSON 清单和 multipart 头留出空间。
   maxProjectBytes + WORKSHOP_LOCAL_IMPORT_MAX_FILES * 4096 + 16 * 1024;

export const isIgnoredWorkshopPath = (path: string) =>
   /(^|\/)(node_modules|\.git)(\/|$)/.test(path);

// WebContainer 的快照序列化不保留 __proto__ 对象键。
const invalidSegments = new Set(['', '.', '..', '__proto__']);

export const isLocalImportPath = (path: string) =>
   path.length <= 1024 - '/project/'.length &&
   !path.includes('\\') &&
   !Array.from(path).some((char) => char.charCodeAt(0) < 32) &&
   path.split('/').every((segment) => !invalidSegments.has(segment));
