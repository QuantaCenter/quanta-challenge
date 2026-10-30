import type { WebContainer } from '~/utils/vivari-runtime';
import type { IFileSystemItem } from '~/components/st/FileSystemTree/type';
import { hasBinarySnapshotExtension } from '@challenge/shared/snapshot-content';

type ChangeTreeItem = { path: string; children?: ChangeTreeItem[] };

/** dispatcher 通过 wc.fs.watch diff 出的文件系统变更，结构与云端同步的 Change 一致 */
export type DispatcherFsChange =
   | { type: 'rm'; path: string }
   | { type: 'mv'; oldPath: string; newPath: string }
   | { type: 'change'; path: string; content: string }
   | { type: 'create'; path: string; content: string };

/**
 * 文件系统变更分发器
 * 监听 WebContainer 文件系统的变更事件，并将变更批量分发到 fsTree 中
 */
export class FileSystemDispatcher {
   private watcher?: { close(): void };
   constructor(
      private getWebContainerInstance: () => Promise<WebContainer>,
      private fsTree: Ref<IFileSystemItem[] | undefined>,
      private changePaths: Set<string> = new Set(),
      private onFsChange?: (changes: DispatcherFsChange[]) => void
   ) {}

   async startListening() {
      const wc = await this.getWebContainerInstance();
      this.watcher = wc.fs.watch('/', { recursive: true }, (event, path) => {
         this._handleFsEvent(event, this._decodePath(path));
      });
   }

   stopListening() {
      this.watcher?.close();
      this.watcher = undefined;
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
      if (event === 'rename' || event === 'change') {
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

   // 单次 dispatch 期间收集到的检测结果，_dispatchChanges 结束后统一回调
   private _detectedAddedPaths: string[] = [];
   private _detectedRemovedPaths: string[] = [];
   private _detectedContentChanges: DispatcherFsChange[] = [];

   private async _dispatchChanges() {
      if (this.changePaths.size === 0) return;

      const pathToDispatch = Array.from(this.changePaths);
      this.changePaths.clear();
      this._detectedAddedPaths = [];
      this._detectedRemovedPaths = [];
      this._detectedContentChanges = [];

      try {
         // 构建变更树
         const changeTree = this._buildChangeTree(pathToDispatch);

         // 遍历并更新 fsTree
         await this._traverseAndUpdate(changeTree);

         // 将 diff 出的变更回调给上层（用于同步到云端）
         await this._emitDetectedChanges();
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
            this._detectedAddedPaths.push(normalizedPath);
            await this._addNodeToFsTree(
               normalizedPath,
               node.children !== undefined
            );
         } else if (!existsInWc && fsNode) {
            // wc 中不存在但 fs 中存在，需要删除
            this._detectedRemovedPaths.push(normalizedPath);
            this._removeNodeFromFsTree(normalizedPath);
         } else if (
            existsInWc &&
            fsNode &&
            fsNode.suspense &&
            fsNode.type === 'folder'
         ) {
            // 悬空文件夹，终止该分支的遍历
            continue;
         } else if (existsInWc && fsNode && fsNode.type === 'file') {
            // 二进制文件按 base64 入库，文本 diff 不适用，跳过
            if (hasBinarySnapshotExtension(normalizedPath)) {
               continue;
            }
            // wc 与树中都存在：对比内容，捕获终端造成的内容修改（如 echo > file）
            try {
               const content = await wc.fs.readFile(pathForWC, 'utf-8');
               if (content !== fsNode.content) {
                  this._detectedContentChanges.push({
                     type: 'change',
                     path: normalizedPath,
                     content,
                  });
                  fsNode.content = content;
               }
            } catch {
               // 读取失败（文件可能又被删掉），交给下一轮事件处理
            }
         }

         // 递归处理子节点
         if (node.children && node.children.length > 0) {
            await this._traverseAndUpdate(node.children);
         }
      }
   }

   private _isDescendantOrSelf(path: string, root: string) {
      return path === root || path.startsWith(`${root}/`);
   }

   /** 将本轮 diff 出的变更整理后回调给上层。*/
   private async _emitDetectedChanges() {
      if (
         this._detectedAddedPaths.length === 0 &&
         this._detectedRemovedPaths.length === 0 &&
         this._detectedContentChanges.length === 0
      ) {
         return;
      }

      const wc = await this.getWebContainerInstance();

      // 分类新增路径：目录 or 文件
      const addedItems: {
         path: string;
         kind: 'file' | 'folder';
         content?: string;
      }[] = [];
      for (const path of this._detectedAddedPaths) {
         const pathForWC = path.slice(1);
         try {
            await wc.fs.readdir(pathForWC);
            addedItems.push({ path, kind: 'folder' });
         } catch {
            try {
               // 二进制文件不入库
               if (hasBinarySnapshotExtension(path)) {
                  continue;
               }
               const content = await wc.fs.readFile(pathForWC, 'utf-8');
               addedItems.push({ path, kind: 'file', content });
            } catch {
               // 路径已再次消失，忽略
            }
         }
      }

      // 同名配对成 mv
      const moves: { oldPath: string; newPath: string }[] = [];
      const removedPaths: string[] = [];
      for (const rmPath of this._detectedRemovedPaths) {
         const base = getBaseName(rmPath);
         const idx = addedItems.findIndex(
            (item) => getBaseName(item.path) === base
         );
         if (idx >= 0) {
            moves.push({ oldPath: rmPath, newPath: addedItems[idx]!.path });
            addedItems.splice(idx, 1);
         } else {
            removedPaths.push(rmPath);
         }
      }

      const changes: DispatcherFsChange[] = [];

      for (const move of moves) {
         changes.push({ type: 'mv', ...move });
      }

      for (const path of removedPaths) {
         // 已被同目录移动的 mv 覆盖
         if (
            moves.some((move) =>
               this._isDescendantOrSelf(path, move.oldPath)
            )
         ) {
            continue;
         }
         changes.push({ type: 'rm', path });
      }

      for (const item of addedItems) {
         // 已被移动到该处的 mv 覆盖
         if (
            moves.some((move) =>
               this._isDescendantOrSelf(item.path, move.newPath)
            )
         ) {
            continue;
         }
         if (item.kind === 'file') {
            changes.push({
               type: 'create',
               path: item.path,
               content: item.content ?? '',
            });
         } else {
            await this._collectFolderFiles(wc, item.path, changes);
         }
      }

      changes.push(...this._detectedContentChanges);

      if (changes.length > 0) {
         this.onFsChange?.(changes);
      }
   }

   /** 递归读取目录下所有文件，作为 create 变更收集 */
   private async _collectFolderFiles(
      wc: WebContainer,
      folderPath: string,
      changes: DispatcherFsChange[]
   ) {
      let entries;
      try {
         entries = await wc.fs.readdir(folderPath.slice(1), {
            withFileTypes: true,
         });
      } catch {
         return;
      }

      for (const entry of entries) {
         const childPath = normalizePath(`${folderPath}/${entry.name}`);
         if (entry.isDirectory()) {
            await this._collectFolderFiles(wc, childPath, changes);
         } else {
            // 二进制文件不入库
            if (hasBinarySnapshotExtension(childPath)) {
               continue;
            }
            try {
               const content = await wc.fs.readFile(
                  childPath.slice(1),
                  'utf-8'
               );
               changes.push({ type: 'create', path: childPath, content });
            } catch {
               // 读取失败，跳过
            }
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
