import type { WebContainer } from '@webcontainer/api';
import type { IFileSystemItem } from '~/components/st/FileSystemTree/type';

type ChangeTreeItem = { path: string; children?: ChangeTreeItem[] };

/**
 * 文件系统变更分发器
 * 监听 WebContainer 文件系统的变更事件，并将变更批量分发到 fsTree 中
 */
export class FileSystemDispatcher {
   constructor(
      private getWebContainerInstance: () => Promise<WebContainer>,
      private fsTree: Ref<IFileSystemItem[] | undefined>,
      private changePaths: Set<string> = new Set()
   ) {}

   async startListening() {
      const wc = await this.getWebContainerInstance();
      wc.fs.watch('/', { recursive: true }, (event, path) => {
         this._handleFsEvent(event, this._decodePath(path));
      });
   }

   stopListening() {
      if (this._dispatchTimer) {
         clearTimeout(this._dispatchTimer);
         this._dispatchTimer = null;
      }
      // 处理剩余的变更
      if (this.changePaths.size > 0) {
         this._dispatchChanges();
      }
   }

   private _decodePath(data: Uint8Array | string): string {
      if (typeof data === 'string') {
         return data;
      }
      return new TextDecoder().decode(data);
   }

   private async _handleFsEvent(event: string, path: string) {
      if (event === 'rename') {
         // 规范化路径后添加到变更集合
         const normalizedPath = normalizePath(`/${path}`);
         if (!this._isTrackedPath(normalizedPath)) return;
         this.changePaths.add(normalizedPath);
         // 防抖处理：延迟一段时间后批量处理变更
         this._scheduleDispatch();
      }
   }

   private _isTrackedPath(path: string): boolean {
      const roots = this.fsTree.value;
      if (!roots || roots.length === 0) return false;
      return roots.some(
         (root) => path === root.path || path.startsWith(`${root.path}/`)
      );
   }

   private _dispatchTimer: ReturnType<typeof setTimeout> | null = null;

   private _scheduleDispatch() {
      if (this._dispatchTimer) {
         clearTimeout(this._dispatchTimer);
      }

      this._dispatchTimer = setTimeout(() => {
         this._dispatchChanges();
      }, 300); // 300ms 防抖
   }

   private async _dispatchChanges() {
      if (this.changePaths.size === 0) return;

      const pathToDispatch = Array.from(this.changePaths);
      this.changePaths.clear();

      try {
         // 构建变更树
         const changeTree = this._buildChangeTree(pathToDispatch);

         // 遍历并更新 fsTree
         await this._traverseAndUpdate(changeTree);
      } catch (error) {
         console.error(
            '[FileSystemDispatcher] Error dispatching changes:',
            error
         );
      }
   }

   private _buildChangeTree(paths: string[]): ChangeTreeItem[] {
      const root: ChangeTreeItem[] = [];

      for (const path of paths) {
         const normalizedPath = normalizePath(path);
         const parts = splitPath(normalizedPath);
         let currentLevel = root;
         let builtPath = '';

         for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;
            builtPath = joinPath(builtPath, part);

            let existingNode = currentLevel.find(
               (node) => node.path === builtPath
            );

            if (!existingNode) {
               existingNode = {
                  path: builtPath,
                  children: i < parts.length - 1 ? [] : undefined,
               };
               currentLevel.push(existingNode);
            }

            if (i < parts.length - 1) {
               if (!existingNode.children) {
                  existingNode.children = [];
               }
               currentLevel = existingNode.children;
            }
         }
      }

      return root;
   }

   private async _traverseAndUpdate(tree: ChangeTreeItem[]) {
      const wc = await this.getWebContainerInstance();

      for (const node of tree) {
         const normalizedPath = normalizePath(node.path);
         // 在 fsTree 中查找对应的节点
         const fsNode = this._findNodeInFsTree(normalizedPath);

         // 检查 wc 中是否存在该路径
         // WebContainer API 不需要前置 /
         const pathForWC = normalizedPath.slice(1);
         let existsInWc = false;
         try {
            await wc.fs.readdir(pathForWC);
            existsInWc = true;
         } catch {
            try {
               await wc.fs.readFile(pathForWC);
               existsInWc = true;
            } catch {
               existsInWc = false;
            }
         }

         if (existsInWc && !fsNode) {
            // wc 中存在但 fs 中不存在，需要新增
            await this._addNodeToFsTree(
               normalizedPath,
               node.children !== undefined
            );
         } else if (!existsInWc && fsNode) {
            // wc 中不存在但 fs 中存在，需要删除
            this._removeNodeFromFsTree(normalizedPath);
         } else if (
            existsInWc &&
            fsNode &&
            fsNode.suspense &&
            fsNode.type === 'folder'
         ) {
            // 悬空文件夹，终止该分支的遍历
            continue;
         }

         // 递归处理子节点
         if (node.children && node.children.length > 0) {
            await this._traverseAndUpdate(node.children);
         }
      }
   }

   private _findNodeInFsTree(path: string): IFileSystemItem | null {
      const normalizedPath = normalizePath(path);
      const pathParts = splitPath(normalizedPath);
      const node = this.fsTree.value;
      if (!node) return null;

      let currentItems = node;

      for (let i = 0; i < pathParts.length; i++) {
         const part = pathParts[i];
         if (!part) continue;

         const nextItem = currentItems.find((item) => item.name === part);
         if (!nextItem) return null;

         if (i === pathParts.length - 1) {
            return nextItem;
         }

         if (nextItem.type !== 'folder' || !nextItem.children) {
            return null;
         }

         currentItems = nextItem.children;
      }

      return null;
   }

   private async _addNodeToFsTree(path: string, isFolder: boolean) {
      const wc = await this.getWebContainerInstance();
      const normalizedPath = normalizePath(path);
      const pathParts = splitPath(normalizedPath);
      const name = getBaseName(normalizedPath);

      if (!name) return;

      const parent = this._traverseFindParentInDispatcher(normalizedPath);
      const newNode: IFileSystemItem = {
         name,
         path: normalizedPath,
         type: isFolder ? 'folder' : 'file',
         suspense: true, // 统一标记为 suspense，让组件去加载内容
         ...(isFolder ? { children: [] } : {}),
      };

      if (parent && parent.children) {
         // 检查是否已存在，避免重复添加
         const existingIndex = parent.children.findIndex(
            (item) => item.path === normalizedPath
         );
         if (existingIndex >= 0) {
            // 已存在则更新
            parent.children[existingIndex] = newNode;
         } else {
            parent.children.push(newNode);
         }
      } else if (pathParts.length === 1 && this.fsTree.value) {
         // 根级别的节点
         const existingIndex = this.fsTree.value.findIndex(
            (item) => item.path === normalizedPath
         );
         if (existingIndex >= 0) {
            this.fsTree.value[existingIndex] = newNode;
         } else {
            this.fsTree.value.push(newNode);
         }
      }
   }

   private _removeNodeFromFsTree(path: string) {
      const normalizedPath = normalizePath(path);
      const parent = this._traverseFindParentInDispatcher(normalizedPath);
      if (parent && parent.children) {
         parent.children = parent.children.filter(
            (item) => item.path !== normalizedPath
         );
      } else if (this.fsTree.value) {
         // 根级别的节点
         const pathParts = splitPath(normalizedPath);
         if (pathParts.length === 1) {
            this.fsTree.value = this.fsTree.value.filter(
               (item) => item.path !== normalizedPath
            );
         }
      }
   }

   private _traverseFindParentInDispatcher(
      path: string
   ): IFileSystemItem | null {
      const normalizedPath = normalizePath(path);
      const pathParts = splitPath(normalizedPath);
      const node = this.fsTree.value;
      if (!node) return null;

      let currentItems = node;
      let parent: IFileSystemItem | null = null;

      for (let i = 0; i < pathParts.length - 1; i++) {
         const part = pathParts[i];
         if (!part) continue;

         const nextItem = currentItems.find((item) => item.name === part);
         if (!nextItem || nextItem.type !== 'folder') {
            return null;
         }
         parent = nextItem;
         currentItems = nextItem.children || [];
      }

      return parent;
   }
}
