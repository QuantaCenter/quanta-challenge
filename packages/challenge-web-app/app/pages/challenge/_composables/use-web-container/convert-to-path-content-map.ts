import type {
   DirectoryNode,
   FileNode,
   FileSystemTree,
} from '@webcontainer/api';
import { normalizePath } from '~/utils/path-utils';
import { encodeSnapshotFile } from '~/utils/snapshot-file';

const isFileNode = (node: any): node is FileNode => {
   return typeof node === 'object' && 'file' in node;
};

const isDirectoryNode = (node: any): node is DirectoryNode => {
   return typeof node === 'object' && 'directory' in node;
};

/** 将 FileSystemTree 转换为路径内容映射，所有路径以 / 开头。 */
export const convertToPathContentMap = (fsTree: FileSystemTree) => {
   const pathContentMap: Record<string, string> = {};

   const traverse = (fsTree: FileSystemTree, currentPath: string) => {
      Object.entries(fsTree).forEach(([name, node]) => {
         if (isFileNode(node)) {
            // 使用 normalizePath 确保路径格式统一
            const filePath = normalizePath(`${currentPath}/${name}`);
            const bytes = typeof node.file.contents === 'string'
               ? new TextEncoder().encode(node.file.contents)
               : node.file.contents;
            pathContentMap[filePath] = encodeSnapshotFile(filePath, bytes);
         } else if (isDirectoryNode(node)) {
            traverse(node.directory, `${currentPath}/${name}`);
         }
      });
   };
   traverse(fsTree, '');

   return pathContentMap;
};
