import { api } from './client';
import { ignored } from './archive';

type TreeItem = {
   path: string;
   mode: string;
   type: string;
   size?: number;
};
export type RepositoryTree = {
   truncated: boolean;
   tree: TreeItem[];
};

const knownSize = (size: number | undefined): size is number =>
   Number.isSafeInteger(size) && size! >= 0;

export function summarizeTree(
   tree: RepositoryTree,
   limits: {
      maxFileBytes: number;
      maxProjectBytes: number;
   },
) {
   const maxProjectBytes = Math.min(limits.maxProjectBytes, 100 * 1024 * 1024);
   if (tree.truncated || tree.tree.length > 5000) {
      return {
         entries: [],
         sizeBytes: null,
         fileCount: 0,
         maxProjectBytes,
         canImport: false,
         reason: '仓库条目数过多，无法完整预览，暂不支持导入',
      };
   }
   const entries = tree.tree.map((item) => ({
      path: item.path,
      kind: item.type === 'tree' ? ('directory' as const) : ('file' as const),
      sizeBytes:
         item.type === 'tree' ? 0 : knownSize(item.size) ? item.size : null,
      excluded: ignored(item.path),
   }));
   const directories = new Map(
      entries
         .filter((item) => item.kind === 'directory')
         .map((item) => [
            item.path,
            item,
         ]),
   );
   let sizeBytes = 0;
   let fileCount = 0;
   let reason = '';
   let completeSize = true;
   for (const [index, item] of tree.tree.entries()) {
      if (item.type === 'tree') {
         continue;
      }
      const entry = entries[index]!;
      const parts = item.path.split('/');
      parts.pop();
      while (parts.length) {
         const directory = directories.get(parts.join('/'));
         if (directory && directory.sizeBytes !== null) {
            directory.sizeBytes =
               entry.sizeBytes === null
                  ? null
                  : directory.sizeBytes + entry.sizeBytes;
         }
         parts.pop();
      }
      if (entry.excluded) {
         continue;
      }
      if (entry.sizeBytes === null) {
         completeSize = false;
      }
      if (
         [
            '120000',
            '160000',
         ].includes(item.mode)
      ) {
         reason ||= '暂不支持包含符号链接或子模块的仓库';
      } else if (item.type !== 'blob' || entry.sizeBytes === null) {
         reason ||= '无法获取完整文件大小，暂不支持导入';
      } else {
         sizeBytes += entry.sizeBytes;
         fileCount++;
         if (entry.sizeBytes > limits.maxFileBytes) {
            reason ||= `仓库包含超过单文件上限（${limits.maxFileBytes / 1024 / 1024} MB）的文件`;
         }
      }
   }
   if (sizeBytes > maxProjectBytes) {
      reason = `预计导入大小超过 ${maxProjectBytes / 1024 / 1024} MB，无法导入`;
   }
   // Sort by path segments so every directory is immediately followed by its descendants.
   entries.sort((a, b) => {
      const left = a.path.split('/');
      const right = b.path.split('/');
      for (let i = 0; i < Math.min(left.length, right.length); i++) {
         if (left[i] !== right[i]) {
            return left[i]! < right[i]! ? -1 : 1;
         }
      }
      return left.length - right.length;
   });
   return {
      entries,
      sizeBytes: completeSize ? sizeBytes : null,
      fileCount,
      maxProjectBytes,
      canImport: !reason,
      reason,
   };
}

export async function readRepositoryTree(
   repositoryId: number,
   branch: string,
   token: string | undefined,
   limits: {
      maxFileBytes: number;
      maxProjectBytes: number;
   },
   signal?: AbortSignal,
) {
   const result = await api<{
      commit: {
         sha: string;
      };
   }>(
      `/repositories/${repositoryId}/branches/${encodeURIComponent(branch)}`,
      token,
      signal,
   );
   const commitSha = result.commit.sha;
   const tree = await api<RepositoryTree>(
      `/repositories/${repositoryId}/git/trees/${commitSha}?recursive=1`,
      token,
      signal,
   );
   return {
      commitSha,
      ...summarizeTree(tree, limits),
   };
}
