import type {
   DirectoryNode,
   FileNode,
   FileSystemTree,
} from '@WebContainer/api';
import { normalizePath } from '~/utils/path-utils';

const isFileNode = (node: any): node is FileNode => {
   return typeof node === 'object' && 'file' in node;
};

const isDirectoryNode = (node: any): node is DirectoryNode => {
   return typeof node === 'object' && 'directory' in node;
};

const uint8ArrayToBase64 = (bytes: Uint8Array) => {
   let binary = '';
   const len = bytes.byteLength;
   for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]!);
   }
   return btoa(binary);
};

/** 将 FileSystemTree 转换为路径内容映射，所有路径以 / 开头。 */
export const convertToPathContentMap = (fsTree: FileSystemTree) => {
   const pathContentMap: Record<string, string> = {};

   const traverse = (fsTree: FileSystemTree, currentPath: string) => {
      Object.entries(fsTree).forEach(([name, node]) => {
         if (isFileNode(node)) {
            // 使用 normalizePath 确保路径格式统一
            const filePath = normalizePath(`${currentPath}/${name}`);
            pathContentMap[filePath] =
               node.file.contents instanceof Uint8Array
                  ? uint8ArrayToBase64(node.file.contents)
                  : node.file.contents;
         } else if (isDirectoryNode(node)) {
            traverse(node.directory, `${currentPath}/${name}`);
         }
      });
   };
   traverse(fsTree, '');

   return pathContentMap;
};
