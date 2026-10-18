import type { DirectoryNode, FileSystemTree } from '@WebContainer/api';
import { normalizePath, splitPath } from '~/utils/path-utils';

const base64ToUint8Array = (base64: string) => {
   const binaryString = atob(base64);
   const len = binaryString.length;
   const bytes = new Uint8Array(len);
   for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
   }
   return bytes;
};

const writeFile = (
   fs: FileSystemTree,
   pathSegments: string[],
   fileName: string,
   contents: string | Uint8Array
) => {
   if (pathSegments.length === 0) {
      if (typeof contents === 'string' && contents.startsWith('data:image')) {
         const b64 = contents.split(',')[1] || '';
         contents = base64ToUint8Array(b64);
      }
      fs[fileName] = {
         file: { contents },
      };
      return;
   }
   const dir = pathSegments.shift()!;
   if (!fs[dir]) {
      fs[dir] = {
         directory: {},
      };
   }
   writeFile(
      (fs[dir] as DirectoryNode).directory,
      pathSegments,
      fileName,
      contents
   );
};

/** 将路径内容映射转换为 FileSystemTree，路径会自动规范化。 */
export const convertToFsTree = (pathContentMap: Record<string, string>) => {
   const fsTree: FileSystemTree = {};
   Object.entries(pathContentMap).forEach(([path, content]) => {
      // 规范化路径并分割
      const normalizedPath = normalizePath(path);
      const segments = splitPath(normalizedPath);

      if (segments.length === 0) return; // 忽略根路径

      const fileName = segments[segments.length - 1]!;
      const dirSegments = segments.slice(0, -1);

      writeFile(fsTree, dirSegments, fileName, content);
   });
   return fsTree;
};
