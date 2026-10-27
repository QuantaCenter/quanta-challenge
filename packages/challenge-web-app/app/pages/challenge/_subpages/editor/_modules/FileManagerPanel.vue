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
} from '@icon-park/vue-next';
import RightClickMenuProvider from '../_components/RightClickMenuProvider.vue';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

defineProps<{
   fsTree?: IFileSystemItem[];
   fileLoader?: (path: string) => Promise<string>;
   dirLoader?: (
      path: string
   ) => Promise<{ name: string; type: 'file' | 'folder' }[]>;
   lastSyncTime?: Date | null;
   isSyncing?: boolean;
   syncStatus?: 'idle' | 'syncing' | 'success' | 'error';
}>();

const selectedPath = defineModel<string>('selectedPath');

const emits = defineEmits<{
   addFile: [];
   addFolder: [];
   moveItem: [oldPath: string, newPath: string];
   fileClick: [item: IFileSystemItem, wasSuspense: boolean];
}>();

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
      class="bg-[#1F1F1F] rounded-xl p-3">
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
            <Operation @click="$emit('addFile')">
               <FileAdditionOne />
            </Operation>
            <Operation @click="$emit('addFolder')">
               <FolderPlus />
            </Operation>
         </StSpace>
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

      <!-- 同步状态显示 -->
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
   </StSpace>
</template>
