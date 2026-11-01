import type { WebContainer } from '@webcontainer/api';
import type { IFileSystemItem } from '~/components/st/FileSystemTree/type';
import type { useMessage } from '~/components/st/Message/use-message';

type MessageAPI = ReturnType<typeof useMessage>;

/**
 * 文件系统操作器
 * 提供对文件系统的各种操作方法，如创建、删除、重命名、移动、复制等
 */
export class FileSystemOperator {
   constructor(
      private getWebContainerInstance: () => Promise<WebContainer>,
      private fsTree: Ref<IFileSystemItem[] | undefined>,
      private message: MessageAPI
   ) {}

   private _traverseFindParent(path: string): IFileSystemItem | null {
      const normalizedPath = normalizePath(path);
      const pathParts = splitPath(normalizedPath);
      const node = this.fsTree.value;
      if (!node) return null;

      let currentItems = node;
      let parent: IFileSystemItem | null = null;

      for (let i = 0; i < pathParts.length - 1; i++) {
         const part = pathParts[i];
         const nextItem = currentItems.find((item) => item.name === part);
         if (!nextItem || nextItem.type !== 'folder' || nextItem.suspense) {
            return null;
         }
         parent = nextItem;
         currentItems = nextItem.children || [];
      }

      return parent;
   }

   async removeItem(path: string, type: 'file' | 'folder') {
      const wc = await this.getWebContainerInstance();
      const normalizedPath = normalizePath(path);

      const confirmed = await dialog.confirm({
         title: type === 'file' ? '删除文件' : '删除文件夹',
         description:
            type === 'file'
               ? '确定要删除该文件吗？此操作无法撤销。'
               : '确定要删除该文件夹及其所有内容吗？此操作无法撤销。',
         variant: 'danger',
         confirmText: '删除',
         cancelText: '取消',
      });

      if (!confirmed) return;

      try {
         // WebContainer API 不需要前置 /
         const pathForWC = normalizedPath.slice(1);
         if (type === 'file') {
            await wc.fs.rm(pathForWC);
         } else {
            await wc.fs.rm(pathForWC, { recursive: true });
         }

         const parent = this._traverseFindParent(normalizedPath);
         if (parent && parent.children) {
            parent.children = parent.children.filter(
               (item) => item.path !== normalizedPath
            );
         }

         // 发送文件删除事件
         const fileDeleteEmitter = useEventBus<{
            path: string;
            type: 'file' | 'folder';
         }>('file-delete-event');
         fileDeleteEmitter.emit({ path: normalizedPath, type });

         this.message.success(
            `已成功删除${type === 'file' ? '文件' : '文件夹'}`
         );
      } catch (error) {
         this.message.error(
            `删除${type === 'file' ? '文件' : '文件夹'}时发生错误`
         );
         console.error('Failed to remove item:', error);
      }
   }

   async renameItem(oldPath: string, defaultName: string) {
      const wc = await this.getWebContainerInstance();
      const normalizedOldPath = normalizePath(oldPath);

      const newName = await dialog.prompt({
         title: '重命名',
         description: '请输入新名称',
         placeholder: '新名称',
         defaultValue: defaultName,
         validator: (value) => {
            if (!value || value.trim().length === 0) {
               return '名称不能为空';
            }
            if (value.includes('/')) {
               return '名称不能包含斜杠';
            }
            return true;
         },
         confirmText: '重命名',
         cancelText: '取消',
      });

      if (!newName) return;

      const parentPath = getParentPath(normalizedOldPath);
      const newPath = joinPath(parentPath, newName);

      try {
         // WebContainer API 不需要前置 /
         const oldPathForWC = normalizedOldPath.slice(1);
         const newPathForWC = newPath.slice(1);
         await wc.fs.rename(oldPathForWC, newPathForWC);

         const parent = this._traverseFindParent(normalizedOldPath);
         if (parent && parent.children) {
            parent.children = parent.children.map((item) => {
               if (item.path === normalizedOldPath) {
                  return { ...item, name: newName, path: newPath };
               }
               return item;
            });
         }

         // 发送文件移动事件（重命名也是路径变化）
         const fileMoveEmitter = useEventBus<{
            oldPath: string;
            newPath: string;
         }>('file-move-event');
         fileMoveEmitter.emit({ oldPath: normalizedOldPath, newPath });
      } catch (error) {
         this.message.error(
            '重命名失败',
            '重命名时发生错误，请检查名称是否已存在'
         );
         console.error('Failed to rename item:', error);
      }
   }

   async moveItem(oldPath: string, newPath: string) {
      const wc = await this.getWebContainerInstance();
      const normalizedOldPath = normalizePath(oldPath);
      const normalizedNewPath = normalizePath(newPath);

      // 检查目标路径是否已存在
      const oldPathForWC = normalizedOldPath.slice(1);
      const newPathForWC = normalizedNewPath.slice(1);

      try {
         await wc.fs.readFile(newPathForWC);
         this.message.warning('移动失败', '目标路径已存在同名文件');
         return;
      } catch {
         try {
            await wc.fs.readdir(newPathForWC);
            this.message.warning('移动失败', '目标路径已存在同名文件夹');
            return;
         } catch {}
      }

      try {
         await wc.fs.rename(oldPathForWC, newPathForWC);

         // 从旧父节点中移除
         const oldParent = this._traverseFindParent(normalizedOldPath);
         let itemToMove: IFileSystemItem | undefined;

         if (oldParent && oldParent.children) {
            itemToMove = oldParent.children.find(
               (item) => item.path === normalizedOldPath
            );
            if (itemToMove) {
               oldParent.children = oldParent.children.filter(
                  (item) => item.path !== normalizedOldPath
               );
            }
         } else if (this.fsTree.value) {
            // 根级别的节点
            itemToMove = this.fsTree.value.find(
               (item) => item.path === normalizedOldPath
            );
            if (itemToMove) {
               this.fsTree.value = this.fsTree.value.filter(
                  (item) => item.path !== normalizedOldPath
               );
            }
         }

         if (!itemToMove) return;

         // 添加到新父节点
         const newParent = this._traverseFindParent(normalizedNewPath);
         const newName = getBaseName(normalizedNewPath);

         // 递归更新所有子节点的路径
         const updatePaths = (
            item: IFileSystemItem,
            oldBasePath: string,
            newBasePath: string
         ) => {
            item.path = replaceBasePath(item.path, oldBasePath, newBasePath);
            if (item.children) {
               item.children.forEach((child) =>
                  updatePaths(child, oldBasePath, newBasePath)
               );
            }
         };

         const movedItem = {
            ...itemToMove,
            name: newName,
            path: normalizedNewPath,
            suspense: true,
         };
         updatePaths(movedItem, normalizedOldPath, normalizedNewPath);

         if (!newParent || !newParent.children) {
            return;
         }
         newParent.children.push(movedItem);

         // 发送文件移动事件
         const fileMoveEmitter = useEventBus<{
            oldPath: string;
            newPath: string;
         }>('file-move-event');
         fileMoveEmitter.emit({
            oldPath: normalizedOldPath,
            newPath: normalizedNewPath,
         });
      } catch (error) {
         this.message.error('移动失败', '移动文件时发生错误');
         console.error('Failed to move item:', error);
      }
   }

   async createFile(path: string, fileName?: string) {
      const wc = await this.getWebContainerInstance();
      const normalizedPath = normalizePath(path);

      const name =
         fileName ||
         (await dialog.prompt({
            title: '新建文件',
            description: '请输入文件名',
            placeholder: 'index.html',
            defaultValue: 'new-file.txt',
            validator: (value) => {
               if (!value || value.trim().length === 0) {
                  return '文件名不能为空';
               }
               if (value.includes('/')) {
                  return '文件名不能包含斜杠';
               }
               return true;
            },
            confirmText: '创建',
            cancelText: '取消',
         }));

      if (!name) return;

      const filePath = joinPath(normalizedPath, name);

      try {
         const initialContent = '';
         // WebContainer API 不需要前置 /
         const filePathForWC = filePath.slice(1);
         await wc.fs.writeFile(filePathForWC, initialContent);

         // 找到父节点并添加新文件
         const parent = this._traverseFindParent(filePath);
         const newFile: IFileSystemItem = {
            name,
            path: filePath,
            type: 'file',
            suspense: true, // 标记为悬空，让组件去加载内容
         };

         if (parent && parent.children) {
            parent.children.push(newFile);
         } else if (this.fsTree.value) {
            // 根级别的文件
            const pathParts = splitPath(filePath);
            if (pathParts.length === 1) {
               this.fsTree.value.push(newFile);
            }
         }

         // 发送文件创建事件
         const fileCreateEmitter = useEventBus<{
            path: string;
            content: string;
         }>('file-create-event');
         fileCreateEmitter.emit({ path: filePath, content: initialContent });

         return filePath;
      } catch (error) {
         this.message.error(
            '创建失败',
            '创建文件时发生错误，请检查文件名是否已存在'
         );
         console.error('Failed to create file:', error);
         return null;
      }
   }

   async createDirectory(path: string, dirName?: string) {
      const wc = await this.getWebContainerInstance();
      const normalizedPath = normalizePath(path);

      const name =
         dirName ||
         (await dialog.prompt({
            title: '新建文件夹',
            description: '请输入文件夹名',
            placeholder: 'components',
            defaultValue: 'new-folder',
            validator: (value) => {
               if (!value || value.trim().length === 0) {
                  return '文件夹名不能为空';
               }
               if (value.includes('/')) {
                  return '文件夹名不能包含斜杠';
               }
               return true;
            },
            confirmText: '创建',
            cancelText: '取消',
         }));

      if (!name) return;

      const dirPath = joinPath(normalizedPath, name);

      try {
         // WebContainer API 不需要前置 /
         const dirPathForWC = dirPath.slice(1);
         await wc.fs.mkdir(dirPathForWC);

         // 找到父节点并添加新文件夹
         const parent = this._traverseFindParent(dirPath);
         const newFolder: IFileSystemItem = {
            name,
            path: dirPath,
            type: 'folder',
            children: [],
            suspense: true,
         };

         if (parent && parent.children) {
            parent.children.push(newFolder);
         } else if (this.fsTree.value) {
            // 根级别的文件夹
            const pathParts = splitPath(dirPath);
            if (pathParts.length === 1) {
               this.fsTree.value.push(newFolder);
            }
         }
      } catch (error) {
         this.message.error(
            '创建失败',
            '创建文件夹时发生错误，请检查文件夹名是否已存在'
         );
         console.error('Failed to create directory:', error);
      }
   }

   async copyItem(path: string, type: 'file' | 'folder') {
      const normalizedPath = normalizePath(path);

      // 将复制的项目信息发送给 UI
      const copyEventEmitter = useEventBus<{
         type: 'file' | 'folder';
         path: string;
         isCut: boolean;
      }>('file-copy-event');
      copyEventEmitter.emit({ type, path: normalizedPath, isCut: false });

      const itemName = getBaseName(normalizedPath);
      this.message.success(
         `已复制${type === 'file' ? '文件' : '文件夹'}: ${itemName}`
      );
   }

   async cutItem(path: string, type: 'file' | 'folder') {
      const normalizedPath = normalizePath(path);

      // 将剪切的项目信息发送给 UI
      const copyEventEmitter = useEventBus<{
         type: 'file' | 'folder';
         path: string;
         isCut: boolean;
      }>('file-copy-event');
      copyEventEmitter.emit({ type, path: normalizedPath, isCut: true });

      const itemName = getBaseName(normalizedPath);
      this.message.success(
         `已剪切${type === 'file' ? '文件' : '文件夹'}: ${itemName}`
      );
   }

   async pasteItem(
      targetPath: string,
      targetType: 'file' | 'folder',
      copiedItem: { type: 'file' | 'folder'; path: string; isCut: boolean }
   ) {
      const wc = await this.getWebContainerInstance();
      const normalizedTargetPath = normalizePath(targetPath);
      const normalizedCopiedPath = normalizePath(copiedItem.path);

      // 如果目标是文件,则粘贴到其父文件夹
      const destDir =
         targetType === 'file'
            ? getParentPath(normalizedTargetPath)
            : normalizedTargetPath;

      const sourceName = getBaseName(normalizedCopiedPath);
      const destPath = joinPath(destDir, sourceName);

      // 如果是剪切操作且目标路径和源路径相同,则不执行
      if (copiedItem.isCut && normalizedCopiedPath === destPath) {
         return;
      }

      // 检查目标路径是否已存在
      // WebContainer API 不需要前置 /
      const destPathForWC = destPath.slice(1);
      const copiedPathForWC = normalizedCopiedPath.slice(1);

      try {
         if (copiedItem.type === 'file') {
            await wc.fs.readFile(destPathForWC);
         } else {
            await wc.fs.readdir(destPathForWC);
         }

         this.message.warning('粘贴失败', '目标位置已存在同名文件或文件夹');
         return;
      } catch {
         // 不存在，可以继续
      }

      try {
         if (copiedItem.isCut) {
            // 剪切操作：移动文件或文件夹
            await this.moveItem(normalizedCopiedPath, destPath);
            this.message.success(
               `已成功移动${copiedItem.type === 'file' ? '文件' : '文件夹'}`
            );
         } else {
            // 复制操作
            if (copiedItem.type === 'file') {
               // 复制文件
               const content = await wc.fs.readFile(copiedPathForWC, 'utf-8');
               await wc.fs.writeFile(destPathForWC, content);
            } else {
               // 复制文件夹（递归）
               await this._copyDirectory(wc, copiedPathForWC, destPathForWC);
            }

            // 添加到 fsTree
            const parent = this._traverseFindParent(destPath);
            const newItem: IFileSystemItem = {
               name: sourceName,
               path: destPath,
               type: copiedItem.type,
               ...(copiedItem.type === 'folder'
                  ? { children: [], suspense: true }
                  : { suspense: true }),
            };

            if (parent && parent.children) {
               parent.children.push(newItem);
            } else if (this.fsTree.value) {
               const pathParts = splitPath(destPath);
               if (pathParts.length === 1) {
                  this.fsTree.value.push(newItem);
               }
            }

            this.message.success(
               `已成功粘贴${copiedItem.type === 'file' ? '文件' : '文件夹'}`
            );
         }
      } catch (error) {
         this.message.error(
            copiedItem.isCut ? '移动失败' : '粘贴失败',
            copiedItem.isCut ? '移动时发生错误' : '粘贴时发生错误'
         );
         console.error('[ERROR] Failed to paste/move item:', error);
      }
   }

   private async _copyDirectory(
      wc: WebContainer,
      sourcePath: string,
      destPath: string
   ) {
      // 注意：sourcePath 和 destPath 已经是去掉前置 / 的格式（WebContainer 格式）

      // 创建目标文件夹
      await wc.fs.mkdir(destPath);

      // 读取源文件夹内容
      const items = await wc.fs.readdir(sourcePath, { withFileTypes: true });

      // 递归复制每个项目
      for (const item of items) {
         const sourceItemPath = `${sourcePath}/${item.name}`;
         const destItemPath = `${destPath}/${item.name}`;

         if (item.isDirectory()) {
            await this._copyDirectory(wc, sourceItemPath, destItemPath);
         } else {
            const content = await wc.fs.readFile(sourceItemPath, 'utf-8');
            await wc.fs.writeFile(destItemPath, content);
         }
      }
   }
}
