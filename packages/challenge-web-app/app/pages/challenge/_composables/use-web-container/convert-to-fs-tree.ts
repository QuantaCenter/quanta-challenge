import type { DirectoryNode, FileSystemTree } from '@webcontainer/api';
import { decodeSnapshotContent } from '@challenge/shared/snapshot-content';
import { normalizePath, splitPath } from '~/utils/path-utils';

const writeFile = (
   fs: FileSystemTree,
   pathSegments: string[],
   fileName: string,
   contents: string | Uint8Array
) => {
   if (pathSegments.length === 0) {
      fs[fileName] = {
         file: {
            contents:
               typeof contents === 'string'
                  ? decodeSnapshotContent(fileName, contents)
                  : contents,
         },
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
