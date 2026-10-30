import type { WebContainer, WebContainerProcess } from '~/utils/vivari-runtime';
import type { CommandData } from '../../_subpages/editor/_components/RightClickMenuProvider.vue';
import type { IFileSystemItem } from '~/components/st/FileSystemTree/type';
import type { DispatcherFsChange } from './file-system-dispatcher';
import { useMessage } from '~/components/st/Message/use-message';
import { normalizePath, getParentPath, getBaseName } from '~/utils/path-utils';
import { FileSystemOperator } from './file-system-operator';
import { FileSystemDispatcher } from './file-system-dispatcher';

export interface IUseCommandsOptions {
   runCommand: (commandLine: string | string[]) => Promise<WebContainerProcess>;
   getWebContainerInstance: () => Promise<WebContainer>;
   fsTree: Ref<IFileSystemItem[] | undefined>;
   /** 监听 WebContainer 文件系统（含终端操作）产生的变更，用于同步到云端 */
   onFsChange?: (changes: DispatcherFsChange[]) => void;
}

export const useCommands = (options: IUseCommandsOptions) => {
   const dispatcher = new FileSystemDispatcher(
      options.getWebContainerInstance,
      options.fsTree,
      undefined,
      options.onFsChange
   );

   const commandEmitter = useEventBus<CommandData>('right-click-menu-command');

   // 存储复制/剪切的项目
   const copiedItem = ref<{
      type: 'file' | 'folder';
      path: string;
      isCut: boolean;
   } | null>(null);
   const copyEventEmitter = useEventBus<{
      type: 'file' | 'folder';
      path: string;
      isCut: boolean;
   }>('file-copy-event');

   // 在组件 setup 阶段立即初始化 message 和 operator
   const message = useMessage();
   const operator = new FileSystemOperator(
      options.getWebContainerInstance,
      options.fsTree,
      message
   );

   onMounted(() => {
      copyEventEmitter.on((data) => {
         copiedItem.value = data;
      });
   });

   const listener = async (commandData: CommandData) => {
      switch (commandData.type) {
         case 'copy': {
            await operator.copyItem(
               commandData.target.path,
               commandData.target.type
            );
            break;
         }
         case 'cut': {
            await operator.cutItem(
               commandData.target.path,
               commandData.target.type
            );
            break;
         }
         case 'paste': {
            if (!copiedItem.value) return;
            await operator.pasteItem(
               commandData.target.path,
               commandData.target.type,
               copiedItem.value
            );
            // 如果是剪切操作，粘贴后清空剪切项
            if (copiedItem.value.isCut) {
               copiedItem.value = null;
            }
            break;
         }
         case 'remove': {
            await operator.removeItem(
               commandData.target.path,
               commandData.target.type
            );
            break;
         }
         case 'rename': {
            const normalizedPath = normalizePath(commandData.target.path);
            const currentName = getBaseName(normalizedPath);
            await operator.renameItem(normalizedPath, currentName);
            break;
         }
         case 'add-file': {
            // 如果是文件，在其父文件夹创建；如果是文件夹，在其内部创建
            const normalizedPath = normalizePath(commandData.target.path);
            const targetPath =
               commandData.target.type === 'file'
                  ? getParentPath(normalizedPath)
                  : normalizedPath;
            await operator.createFile(targetPath);

            break;
         }
         case 'add-folder': {
            // 如果是文件，在其父文件夹创建；如果是文件夹，在其内部创建
            const normalizedPath = normalizePath(commandData.target.path);
            const targetPath =
               commandData.target.type === 'file'
                  ? getParentPath(normalizedPath)
                  : normalizedPath;
            await operator.createDirectory(targetPath);
            break;
         }
      }
   };

   onMounted(() => {
      commandEmitter.on(listener);
      dispatcher.startListening();
   });

   onUnmounted(() => {
      commandEmitter.off(listener);
      dispatcher.stopListening();
   });

   return {
      commandEmitter,
      operator,
      dispatcher,
   };
};
