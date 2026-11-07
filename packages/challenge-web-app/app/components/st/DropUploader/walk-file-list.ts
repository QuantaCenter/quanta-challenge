import { encodeSnapshotFile } from '~/utils/snapshot-file';

export type File = string;
export interface IDirectory {
   [key: string]: File | IDirectory;
}

interface IWalkFileListOptions {
   exclude?: {
      directories?: string[];
      files?: string[];
   };
}

export const walkFileList = async (
   fileList: FileList,
   options?: IWalkFileListOptions
) => {
   const currentDirectory: IDirectory = {};
   const excludeDirectories = options?.exclude?.directories || [];
   const excludeFiles = options?.exclude?.files || [];

   for (const file of Array.from(fileList)) {
      const pathParts = file.webkitRelativePath.split('/');
      let currentDir = currentDirectory;

      const dirs = pathParts.slice(0, -1);
      if (excludeDirectories.some((dir) => dirs.includes(dir))) {
         continue; // Skip excluded directories
      }
      if (excludeFiles.includes(file.name)) {
         continue; // Skip excluded files
      }

      for (let i = 0; i < pathParts.length - 1; i++) {
         const part = pathParts[i]!;
         if (!currentDir[part]) {
            currentDir[part] = {};
         }
         currentDir = currentDir[part] as IDirectory;
      }

      currentDir[pathParts[pathParts.length - 1]!] = encodeSnapshotFile(
         file.name, new Uint8Array(await file.arrayBuffer())
      );
   }
   return currentDirectory;
};
