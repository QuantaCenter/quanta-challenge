<script setup lang="ts">
import { type IDirectory, walkFileList } from './walk-file-list';
import { ignores } from './default-ignore';
import type { DefineComponent } from 'vue';
import { InboxUploadR } from '@icon-park/vue-next';

const props = defineProps<{
   icon?: DefineComponent;
   placeholder?: string;
   accept?: string;
   multiple?: boolean;
   type?: 'file' | 'folder';
   ignores?: {
      directories?: string[];
      files?: string[];
   };
}>();

const uploadInput = useTemplateRef('uploadInput');

const handleUpload = () => {
   if (!uploadInput.value) return;
   uploadInput.value.click();
};

const onFileOrFolderSelected = (event: Event) => {
   if (props.type === 'folder') {
      onFolderSelected(event);
   } else {
      onFileSelected(event);
   }
};

const directory = defineModel<IDirectory>('directory', {
   default: () => ({}),
});
const onFolderSelected = async (event: Event) => {
   const fileList = (event.target as HTMLInputElement).files;
   if (!fileList || fileList.length === 0) return;

   directory.value = await walkFileList(fileList, {
      exclude: {
         directories: props.ignores?.directories ?? ignores.directories,
         files: props.ignores?.files ?? ignores.files,
      },
   });
};

const files = defineModel<FileList>('files');
const onFileSelected = (event: Event) => {
   const fileList = (event.target as HTMLInputElement).files;
   if (!fileList || fileList.length === 0) return;
   files.value = fileList;
};
</script>

<template>
   <div
      @click="handleUpload"
      class="flex justify-center items-center w-full h-full">
      <input
         v-bind="type === 'folder' ? { webkitdirectory: true } : {}"
         @change="onFileOrFolderSelected"
         :accept="accept"
         ref="uploadInput"
         type="file"
         class="hidden" />
      <div
         class="flex flex-col justify-center items-center gap-3 text-accent-200">
         <slot name="icon"></slot>
         <Component
            :is="props.icon ?? InboxUploadR"
            class="font-light"
            size="48px"
            stroke-width="2" />
         <span class="st-font-caption text-[0.875rem]">
            {{ placeholder ?? '点击或拖拽文件到此处上传' }}
         </span>
      </div>
   </div>
</template>
