<script setup lang="ts">
import type { IFileSystemItem } from './type';

defineSlots<{
   'item-extra'?: (props: { item: IFileSystemItem }) => unknown;
}>();

const props = defineProps<{
   directory: IFileSystemItem[];
   currentFilePath?: string;
   deep?: number;
   defaultOpened?: boolean;
   readOnly?: boolean;
   fileLoader?: (path: string) => Promise<string>;
   dirLoader?: (path: string) => Promise<
      {
         name: string;
         type: 'file' | 'folder';
      }[]
   >;
}>();

const sortedDirectory = computed(() => {
   return [
      ...props.directory,
   ].sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') {
         return -1;
      }
      if (a.type === 'file' && b.type === 'folder') {
         return 1;
      }
      return a.name.localeCompare(b.name);
   });
});

const emits = defineEmits<{
   'file-or-folder-click': [
      item: IFileSystemItem,
      wasSuspense: boolean,
   ];
   'drag-start': [
      item: IFileSystemItem,
   ];
   'drag-end': [];
   drop: [
      targetFolder: IFileSystemItem,
      draggedItem: IFileSystemItem,
   ];
}>();

// 全局拖拽状态管理 - 使用 provide/inject 确保跨层级共享
const injectedDraggedItem = inject<Ref<IFileSystemItem | null>>(
   'fs-tree-dragged-item',
   ref(null),
);

// 如果是根节点，提供全局状态
if (props.deep === undefined || props.deep === 0) {
   provide('fs-tree-dragged-item', injectedDraggedItem);
}

const handleFileOrFolderClick = async (fileOrFolder: IFileSystemItem) => {
   const wasSuspense = fileOrFolder.suspense === true;

   if (fileOrFolder.suspense) {
      if (fileOrFolder.type === 'folder' && props.dirLoader) {
         const dir = await props.dirLoader(fileOrFolder.path);
         const dirPath = fileOrFolder.path.endsWith('/')
            ? fileOrFolder.path.slice(0, -1)
            : fileOrFolder.path;
         fileOrFolder.children = dir.map((item) => ({
            name: item.name,
            type: item.type,
            path: `${dirPath}/${item.name}`,
            suspense: true,
         }));
         fileOrFolder.suspense = false;
      } else if (fileOrFolder.type === 'file' && props.fileLoader) {
         fileOrFolder.content = await props.fileLoader(fileOrFolder.path);
         fileOrFolder.suspense = false;
      }
   }
   emits('file-or-folder-click', fileOrFolder, wasSuspense);
};

const handleDragStart = (item: IFileSystemItem) => {
   injectedDraggedItem.value = item;
   emits('drag-start', item);
};

const handleDragEnd = () => {
   injectedDraggedItem.value = null;
   emits('drag-end');
};

const handleDrop = (
   targetFolder: IFileSystemItem,
   _draggedItem: IFileSystemItem | null,
) => {
   // 优先使用传递过来的 draggedItem，如果没有则使用全局的
   const itemToDrop = _draggedItem || injectedDraggedItem.value;

   if (!itemToDrop) {
      console.warn('[FileSystemTree] Drop failed: no dragged item found');
      return;
   }

   // 防止将文件夹拖到自己或自己的子文件夹中
   if (itemToDrop.path === targetFolder.path) {
      console.warn('[FileSystemTree] Cannot drop folder into itself');
      return;
   }
   if (targetFolder.path.startsWith(itemToDrop.path + '/')) {
      console.warn('[FileSystemTree] Cannot drop folder into its subfolder');
      return;
   }

   emits('drop', targetFolder, itemToDrop);
   injectedDraggedItem.value = null;
};
</script>

<template>
   <div class="w-full">
      <div
         v-for="item in sortedDirectory"
         :key="item.path"
         class="w-full">
         <StFileSystemTreeFileItem
            v-if="item.type === 'file'"
            @click="handleFileOrFolderClick(item)"
            @drag-start="handleDragStart"
            @drag-end="handleDragEnd"
            :file="item"
            :read-only="props.readOnly"
            :selected="props.currentFilePath === item.path"
            :deep="deep ?? 0">
            <template
               v-if="$slots['item-extra']"
               #extra>
               <slot
                  name="item-extra"
                  :item="item" />
            </template>
         </StFileSystemTreeFileItem>
         <StFileSystemTreeFolderItem
            v-else
            :default-opened="props.defaultOpened"
            :folder="item"
            :read-only="props.readOnly"
            :current-file-path="props.currentFilePath"
            :deep="deep ?? 0"
            @file-or-folder-click="handleFileOrFolderClick"
            @drag-start="handleDragStart"
            @drag-end="handleDragEnd"
            @drop="handleDrop">
            <template
               v-if="$slots['item-extra']"
               #extra>
               <slot
                  name="item-extra"
                  :item="item" />
            </template>
            <template
               v-if="$slots['item-extra']"
               #item-extra="slotProps">
               <slot
                  name="item-extra"
                  v-bind="slotProps" />
            </template>
         </StFileSystemTreeFolderItem>
      </div>
   </div>
</template>
