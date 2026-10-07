import { relative, sep } from 'node:path';

/** Windows 上 path.sep 是 `\`，但快照键、URL 路径必须永远是 `/` */
export const toPosix = (path: string): string => path.split(sep).join('/');

/** 相对 base 的 posix 路径；不在 base 下时返回绝对 posix 路径 */
/** 把绝对路径显示成相对 cwd 的形式，日志里更短更好读 */
export const displayPath = (cwd: string, target: string): string => {
   const rel = relative(cwd, target);
   return rel.startsWith('..') ? target : toPosix(rel);
};

/** 统一 `/` 前缀、折叠 `.` 与重复斜杠，用于快照键归一化 */
export const normalizeSnapshotKey = (key: string): string => {
   const segments = toPosix(key)
      .split('/')
      .filter((s) => s && s !== '.');
   return `/${segments.join('/')}`;
};

export const joinSnapshotKey = (
   mountPath: string,
   relativePath: string,
): string => normalizeSnapshotKey(`${mountPath}/${relativePath}`);

export const formatBytes = (bytes: number): string => {
   if (bytes < 1024) return `${bytes} B`;
   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
   return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};
