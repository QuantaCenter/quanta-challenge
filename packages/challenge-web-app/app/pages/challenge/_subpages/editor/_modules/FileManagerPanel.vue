<script setup lang="tsx">
import type { Component } from 'vue';
import type { IFileSystemItem } from '~/components/st/FileSystemTree/type';
import FsTreeSkeleton from '../_skeletons/FsTreeSkeleton.vue';
import {
   FileAdditionOne,
   FolderPlus,
   LoadingFour,
   LinkCloudFaild,
   LinkCloudSucess,
   DatabaseSync,
   Upload,
} from '@icon-park/vue-next';
import RightClickMenuProvider from '../_components/RightClickMenuProvider.vue';
import type { IUploadItem } from '../_utils/upload-item';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const props = defineProps<{
   fsTree?: IFileSystemItem[];
   fileLoader?: (path: string) => Promise<string>;
   dirLoader?: (
      path: string
   ) => Promise<{ name: string; type: 'file' | 'folder' }[]>;
   lastSyncTime?: Date | null;
   isSyncing?: boolean;
   syncStatus?: 'idle' | 'syncing' | 'success' | 'error';
   /** 开启后显示「上传」按钮，并支持从系统拖入文件 / 文件夹 */
   uploadable?: boolean;
   /** 上传目标目录的展示名（拖拽遮罩里提示用） */
   uploadTargetLabel?: string;
}>();

const selectedPath = defineModel<string>('selectedPath');

const emits = defineEmits<{
   addFile: [];
   addFolder: [];
   moveItem: [oldPath: string, newPath: string];
   fileClick: [item: IFileSystemItem, wasSuspense: boolean];
   upload: [items: IUploadItem[]];
}>();

// ————————————————— 上传 —————————————————
const uploadInput = useTemplateRef<HTMLInputElement>('upload-input');
const onUploadInputChange = (event: Event) => {
   const input = event.target as HTMLInputElement;
   const files = Array.from(input.files ?? []);
   input.value = '';
   if (files.length) {
      emits('upload', files.map((file) => ({ file, relativePath: file.name })));
   }
};

const isExternalFileDrag = (event: DragEvent) =>
   !!props.uploadable && !!event.dataTransfer?.types.includes('Files');

/** 拖拽遮罩：dragenter / dragleave 会在子元素间反复触发，用计数判断是否真正离开 */
const dragDepth = ref(0);
const fileDragging = computed(() => dragDepth.value > 0);

const onDragEnter = (event: DragEvent) => {
   if (!isExternalFileDrag(event)) return;
   event.preventDefault();
   event.stopPropagation();
   dragDepth.value += 1;
};
const onDragOver = (event: DragEvent) => {
   if (!isExternalFileDrag(event)) return;
   // 捕获阶段拦下，避免文件树把它当成内部移动
   event.preventDefault();
   event.stopPropagation();
   event.dataTransfer!.dropEffect = 'copy';
};
const onDragLeave = (event: DragEvent) => {
   if (!isExternalFileDrag(event)) return;
   event.stopPropagation();
   dragDepth.value = Math.max(0, dragDepth.value - 1);
};

const readEntry = async (
   entry: FileSystemEntry,
   prefix: string,
   result: IUploadItem[],
): Promise<void> => {
   if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
         (entry as FileSystemFileEntry).file(resolve, reject),
      );
      result.push({ file, relativePath: `${prefix}${entry.name}` });
      return;
   }
   if (!entry.isDirectory) return;
   // 依赖与版本库目录不上传
   if (['node_modules', '.git'].includes(entry.name)) return;
   const reader = (entry as FileSystemDirectoryEntry).createReader();
   // readEntries 每次最多返回 100 项，需要循环读到空为止
   for (;;) {
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) =>
         reader.readEntries(resolve, reject),
      );
      if (!entries.length) break;
      for (const child of entries) {
         await readEntry(child, `${prefix}${entry.name}/`, result);
      }
   }
};

const onDrop = async (event: DragEvent) => {
   if (!isExternalFileDrag(event)) return;
   event.preventDefault();
   event.stopPropagation();
   dragDepth.value = 0;
   const transfer = event.dataTransfer!;
   // 必须在事件同步阶段取出 entry，异步之后 DataTransfer 会被清空
   const entries = Array.from(transfer.items ?? [])
      .map((item) => item.webkitGetAsEntry?.())
      .filter((entry): entry is FileSystemEntry => !!entry);
   let items: IUploadItem[] = [];
   if (entries.length) {
      for (const entry of entries) await readEntry(entry, '', items);
   } else {
      items = Array.from(transfer.files).map((file) => ({
         file,
         relativePath: file.name,
      }));
   }
   if (items.length) emits('upload', items);
};

const onFileOrFolderClick = (item: IFileSystemItem, wasSuspense: boolean) => {
   selectedPath.value = item.path;
   if (item.type === 'file') {
      emits('fileClick', item, wasSuspense);
   }
};

const Operation: Component = (_, { slots }) => {
   return (
      <div class='cursor-pointer hover:bg-accent-500/50 transition-colors p-1 rounded-sm'>
         {slots.default?.()}
      </div>
   );
};

// 处理拖拽移动
const handleDrop = (
   targetFolder: IFileSystemItem,
   draggedItem: IFileSystemItem
) => {
   if (!targetFolder || !draggedItem) return;

   // 构建新路径
   const targetPath = targetFolder.path.endsWith('/')
      ? targetFolder.path.slice(0, -1)
      : targetFolder.path;
   const newPath = `${targetPath}/${draggedItem.name}`;

   // 触发移动事件
   emits('moveItem', draggedItem.path, newPath);
};

// 获取完整的同步状态显示文本
const getSyncDisplayText = (
   status?: 'idle' | 'syncing' | 'success' | 'error',
   lastSyncTime?: Date | null
) => {
   const timeStr = lastSyncTime ? dayjs(lastSyncTime).format('HH:mm:ss') : '';

   switch (status) {
      case 'syncing':
         return {
            Icon: LoadingFour,
            text: '正在同步到云端...',
            spinning: true,
         };
      case 'error':
         return {
            Icon: LinkCloudFaild,
            text: timeStr ? `云同步失败 · 上次成功: ${timeStr}` : '同步失败',
            spinning: false,
         };
      default:
         return {
            Icon: timeStr ? LinkCloudSucess : DatabaseSync,
            text: timeStr ? `已同步到云端 · ${timeStr}` : '无需同步',
            spinning: false,
         };
   }
};
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      gap="1rem"
      class="relative bg-[#1F1F1F] rounded-xl p-3"
      @dragenter.capture="onDragEnter"
      @dragover.capture="onDragOver"
      @dragleave.capture="onDragLeave"
      @drop.capture="onDrop">
      <StSpace
         fill-x
         justify="between"
         align="center"
         class="text-accent-200"
         gap="0">
         <h2 class="st-font-body-normal overflow-ellipsis line-clamp-1">
            资源管理器
         </h2>
         <StSpace gap="0.25rem">
            <StPopover v-if="uploadable" content="上传文件（也可直接拖入）" placement="bottom">
               <Operation @click="uploadInput?.click()">
                  <Upload />
               </Operation>
            </StPopover>
            <Operation @click="$emit('addFile')">
               <FileAdditionOne />
            </Operation>
            <Operation @click="$emit('addFolder')">
               <FolderPlus />
            </Operation>
         </StSpace>
         <input
            v-if="uploadable"
            ref="upload-input"
            type="file"
            multiple
            class="hidden"
            @change="onUploadInputChange" />
      </StSpace>
      <StSpace
         fill-x
         class="relative flex-1 min-h-0 overflow-y-auto overscroll-y-contain overflow-x-hidden">
         <StSkeleton :loading="!fsTree">
            <template #loading>
               <FsTreeSkeleton />
            </template>
            <RightClickMenuProvider>
               <StFileSystemTree
                  v-if="fsTree"
                  class="absolute top-0 left-0"
                  @contextmenu.prevent
                  @file-or-folder-click="onFileOrFolderClick"
                  @drop="handleDrop"
                  :dir-loader="dirLoader"
                  :file-loader="fileLoader"
                  :current-file-path="selectedPath"
                  :default-opened="true"
                  :directory="fsTree" />
            </RightClickMenuProvider>
         </StSkeleton>
      </StSpace>

      <!-- 同步状态显示：复用方（如工坊）可通过 footer 插槽替换为自己的状态 -->
      <slot name="footer">
         <StSpace
            fill-x
            align="center"
            gap="0.5rem"
            class="bg-accent-600/50 rounded-lg px-4 py-3 text-accent-400">
            <component
               :is="getSyncDisplayText(syncStatus, lastSyncTime).Icon"
               :class="
                  getSyncDisplayText(syncStatus, lastSyncTime).spinning
                     ? 'animate-spin'
                     : ''
               "
               :size="16"
               :strokeWidth="3" />
            <span class="text-xs">
               {{ getSyncDisplayText(syncStatus, lastSyncTime).text }}
            </span>
         </StSpace>
      </slot>

      <!-- 从系统拖入文件时的投放提示 -->
      <Transition
         enter-active-class="transition-opacity duration-150"
         enter-from-class="opacity-0"
         leave-active-class="transition-opacity duration-150"
         leave-to-class="opacity-0">
         <StSpace
            v-if="fileDragging"
            direction="vertical"
            center
            gap="0.5rem"
            class="pointer-events-none absolute inset-0 z-30 rounded-xl border-2 border-dashed border-primary bg-[#1F1F1F]/90 text-accent-100">
            <Upload size="2rem" class="text-primary" />
            <span class="st-font-body-bold">释放以上传</span>
            <span class="text-xs text-accent-300">
               上传到 {{ uploadTargetLabel || '项目根目录' }}
            </span>
         </StSpace>
      </Transition>
   </StSpace>
</template>
