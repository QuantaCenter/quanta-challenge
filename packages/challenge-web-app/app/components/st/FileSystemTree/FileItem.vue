<script setup lang="tsx">
import { FileCode } from '@icon-park/vue-next';
import type { IFileSystemItem } from './type';
import { extensionIconMapping } from './config';

const props = defineProps<{
   file: IFileSystemItem;
   deep: number;
   selected?: boolean;
   readOnly?: boolean;
}>();

const emits = defineEmits<{
   dragStart: [
      item: IFileSystemItem,
   ];
   dragEnd: [];
}>();

const FileIcon = () => {
   const name = props.file.name;
   const segments = name.split('.');
   for (let i = -1; i < segments.length; i++) {
      const ext = i === -1 ? name : '.' + segments.slice(i).join('.');
      const iconPath =
         extensionIconMapping.get(ext) || extensionIconMapping.get(name);
      if (iconPath) {
         return (
            <img
               src={iconPath}
               alt={name}
               class="size-4 shrink-0"
            />
         );
      }
   }
   return (
      <FileCode
         theme="filled"
         size="1rem"
      />
   );
};

const handleDragStart = (e: DragEvent) => {
   if (props.readOnly) {
      return;
   }
   e.dataTransfer!.effectAllowed = 'move';
   e.dataTransfer!.setData('text/plain', props.file.path);
   emits('dragStart', props.file);
};

const handleDragEnd = () => {
   emits('dragEnd');
};
</script>

<template>
   <div
      :draggable="!props.readOnly"
      data-type="file"
      :data-path="props.file.path"
      :style="{ paddingLeft: `${props.deep * 1 + 0.5}rem` }"
      class="flex items-center gap-1 font-mono w-full py-1 px-2 hover:cursor-pointer hover:bg-accent-600 transition-colors"
      :class="{
         'bg-accent-600': props.selected,
         'min-w-0': $slots.extra,
         'min-w-fit': !$slots.extra,
      }"
      @dragstart="handleDragStart"
      @dragend="handleDragEnd">
      <FileIcon class="pointer-events-none" />
      <div
         class="pointer-events-none text-sm text-nowrap whitespace-nowrap"
         :class="{ 'min-w-0 truncate': $slots.extra }">
         {{ file.name }}
      </div>
      <div
         v-if="$slots.extra"
         class="ml-auto flex shrink-0 items-center gap-2 pl-3">
         <slot name="extra" />
      </div>
   </div>
</template>
