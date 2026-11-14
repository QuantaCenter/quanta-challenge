<script setup lang="ts">
import { FolderClose, FolderOpen } from '@icon-park/vue-next';
import type { IFileSystemItem } from './type';

defineSlots<{
   extra?: () => unknown;
   'item-extra'?: (props: { item: IFileSystemItem }) => unknown;
}>();

const props = defineProps<{
   folder: IFileSystemItem;
   deep: number;
   defaultOpened?: boolean;
   currentFilePath?: string;
   readOnly?: boolean;
}>();

const opened = ref(props.defaultOpened ?? false);

const emits = defineEmits<{
   'file-or-folder-click': [
      item: IFileSystemItem,
   ];
   dragStart: [
      item: IFileSystemItem,
   ];
   dragEnd: [];
   drop: [
      targetFolder: IFileSystemItem,
      draggedItem: IFileSystemItem,
   ];
}>();

const handleFileOrFolderClick = (fileOrFolder: IFileSystemItem) => {
   emits('file-or-folder-click', fileOrFolder);
};

const handleOpenedChange = () => {
   opened.value = !opened.value;
   return true;
};

const selected = computed(() => {
   return props.currentFilePath === props.folder.path;
});

// 拖拽相关
const isDragOver = ref(false);

const handleDragStart = (e: DragEvent) => {
   if (props.readOnly) {
      return;
   }
   e.stopPropagation();
   e.dataTransfer!.effectAllowed = 'move';
   e.dataTransfer!.setData('text/plain', props.folder.path);
   emits('dragStart', props.folder);
};

const handleDragEnd = () => {
   emits('dragEnd');
};

const handleDragOver = (e: DragEvent) => {
   if (props.readOnly) {
      return;
   }
   e.preventDefault();
   e.stopPropagation();
   e.dataTransfer!.dropEffect = 'move';
   isDragOver.value = true;
};

const handleDragLeave = (e: DragEvent) => {
   e.stopPropagation();
   isDragOver.value = false;
};

const handleDrop = (e: DragEvent) => {
   if (props.readOnly) {
      return;
   }
   e.preventDefault();
   e.stopPropagation();
   isDragOver.value = false;
   // 不传递具体的 draggedItem，让父组件使用自己维护的 draggedItem
   emits('drop', props.folder, null as any);
};

const handleChildDragStart = (item: IFileSystemItem) => {
   emits('dragStart', item);
};

const handleChildDragEnd = () => {
   emits('dragEnd');
};

const handleChildDrop = (
   targetFolder: IFileSystemItem,
   draggedItem: IFileSystemItem,
) => {
   emits('drop', targetFolder, draggedItem);
};
</script>

<template>
   <div class="flex flex-col w-full">
      <div
         :draggable="!props.readOnly"
         :role="props.readOnly ? 'button' : undefined"
         :tabindex="props.readOnly ? 0 : undefined"
         :aria-expanded="opened"
         :aria-label="props.readOnly ? props.folder.path : undefined"
         data-type="folder"
         :data-path="props.folder.path"
         :style="{ paddingLeft: `${props.deep * 1 + 0.5}rem` }"
         class="flex items-center gap-1 font-mono py-1 px-2 hover:cursor-pointer hover:bg-accent-600 w-full transition-all border-transparent"
         :class="{
            'bg-accent-600': selected,
            'bg-primary/30 border-l-2 !border-primary': isDragOver,
         }"
         @click.stop="handleOpenedChange() && handleFileOrFolderClick(folder)"
         @keydown.enter.prevent="handleOpenedChange() && handleFileOrFolderClick(folder)"
         @keydown.space.prevent="handleOpenedChange() && handleFileOrFolderClick(folder)"
         @dragstart="handleDragStart"
         @dragend="handleDragEnd"
         @dragover="handleDragOver"
         @dragleave="handleDragLeave"
         @drop="handleDrop">
         <FolderOpen
            v-show="opened"
            theme="filled"
            size="1rem"
            class="text-secondary pointer-events-none" />
         <FolderClose
            v-show="!opened"
            theme="filled"
            size="1rem"
            class="text-secondary icon pointer-events-none" />
         <div
            class="text-sm text-nowrap whitespace-nowrap pointer-events-none"
            :class="{ 'min-w-0 truncate': $slots.extra }">
            {{ folder.name }}
         </div>
         <div
            v-if="$slots.extra"
            class="ml-auto flex shrink-0 items-center gap-2 pl-3">
            <slot name="extra" />
         </div>
      </div>
      <StFileSystemTree
         v-if="opened"
         @file-or-folder-click="handleFileOrFolderClick"
         @drag-start="handleChildDragStart"
         @drag-end="handleChildDragEnd"
         @drop="handleChildDrop"
         :current-file-path="props.currentFilePath"
         :read-only="props.readOnly"
         :directory="folder.children ?? []"
         :deep="deep + 1">
         <template
            v-if="$slots['item-extra']"
            #item-extra="slotProps">
            <slot
               name="item-extra"
               v-bind="slotProps" />
         </template>
      </StFileSystemTree>
   </div>
</template>

<style scoped>
.icon :deep(path):nth-child(2) {
   stroke: var(--st-color-secondary);
}
</style>
