<script setup lang="ts">
import { DeleteFour } from '@icon-park/vue-next';
import type { IDirectory } from '~/components/st/DropUploader/walk-file-list';
import type { IFileSystemItem } from '~/components/st/FileSystemTree/type';
import { normalizePath, getBaseName, joinPath } from '~/utils/path-utils';
import { buildFileSystemTree } from '~/utils/fs-tree';

const props = defineProps<{
   placeholder?: string;
   ignoreDirectories?: string[];
}>();

const directory = ref<IDirectory>();
const fileSystemItems = ref<IFileSystemItem[]>([]);
const projectFs = defineModel<Record<string, string>>('projectFs');

/**
 * 是否真的选了东西。
 *
 * 不能直接写 `v-if="!projectFs"`：**空对象 {} 在 JS 里是 truthy**，
 * 而调用方（发布/重新发布页）会把 `referenceAnswer` 初始化成 `{}`，
 * 于是组件会走"已选择"分支，渲染出一棵空目录树 + 一个「取消选择」按钮。
 */
const hasProjectFs = computed(
   () => Object.keys(projectFs.value ?? {}).length > 0
);

const walkDirectory = () => {
   if (!directory.value) {
      fileSystemItems.value = [];
      return;
   }
   const project: Record<string, string> = {};
   const flatDirectory = (dir: IDirectory, root = ''): IFileSystemItem[] => {
      const isFolder = (value: any): value is IDirectory => {
         return typeof value !== 'string' && value !== null;
      };
      return Object.entries(dir).map(([key, value]) => {
         const itemPath = normalizePath(joinPath(root, key));
         if (!isFolder(value)) {
            project[itemPath] = value;
         }
         return {
            name: getBaseName(itemPath),
            path: itemPath,
            type: isFolder(value) ? 'folder' : 'file',
            content: isFolder(value) ? undefined : value,
            children: isFolder(value)
               ? flatDirectory(value, itemPath)
               : undefined,
         };
      });
   };
   projectFs.value = project;
   fileSystemItems.value = flatDirectory(directory.value);
};

watch(directory, walkDirectory, { immediate: true });

const previewCode = ref('');
const previewCodeLang = ref('plaintext');
const currentFilePath = ref<string>();
const previewImageBase64 = ref<string>();
const handleFileOrFolderClick = (target: IFileSystemItem) => {
   if (target.type === 'folder') return;
   if (target.content?.startsWith('data:image')) {
      previewImageBase64.value = target.content;
      currentFilePath.value = target.path;
      previewCode.value = '';
      return;
   }
   previewImageBase64.value = undefined;
   previewCode.value = target.content || '';
   previewCodeLang.value = detectLanguage(target.name);
   currentFilePath.value = target.path;
};

const handleRemoveFile = () => {
   fileSystemItems.value = [];
   previewCode.value = '';
   directory.value = undefined;
   projectFs.value = undefined;
};

// 从 projectFs 重建 FileSystemItem[]
// 使用统一的工具函数
const restoreFileSystemItem = () => {
   // 空对象/undefined 都视为"没选"
   if (!hasProjectFs.value) {
      fileSystemItems.value = [];
      return;
   }

   const { rootNodes } = buildFileSystemTree(projectFs.value!);
   fileSystemItems.value = rootNodes;
};
// 必须 watch 而不是只在 setup 里调一次：
// 编辑（重新发布）场景下 projectFs 是**异步**回填的（父组件 onMounted 里请求详情），
// 只调一次的话，回填完的答案模板也不会显示出来。
watch(projectFs, restoreFileSystemItem, { immediate: true, deep: true });
</script>

<template>
   <div
      :class="[
         'border border-accent-300 rounded-lg overflow-hidden',
         !projectFs ? 'h-[10.6rem]' : 'h-[20rem]',
         [
            'bg-background',
            !projectFs && 'hover:bg-accent-600/50 hover:cursor-pointer',
         ],
         'transition-colors',
         'flex items-center justify-center',
      ]">
      <StDropUploader
         v-if="!hasProjectFs"
         :ignores="{ directories: props.ignoreDirectories }"
         :placeholder="props.placeholder"
         type="folder"
         @update:directory="directory = $event" />
      <StSpace v-else fill gap="0.75rem" class="p-2">
         <StSpace
            direction="vertical"
            gap="0.5rem"
            class="w-[12.56rem] h-full shrink-0 pt-1">
            <StScrollable fill scroll-y class="overflow-x-hidden">
               <StSpace direction="vertical">
                  <StFileSystemTree
                     @file-or-folder-click="handleFileOrFolderClick"
                     :current-file-path="currentFilePath"
                     :directory="fileSystemItems"
                     default-opened
                     class="w-full h-full" />
                  <div class="h-16 w-full"></div>
               </StSpace>
            </StScrollable>
            <StButton
               @click="handleRemoveFile"
               class="!rounded-[0.25rem] !bg-transparent border !border-error h-[1.875rem] w-full px-[1.25rem]">
               <StSpace gap="0.375rem" align="center" class="text-error">
                  <DeleteFour />
                  <span class="st-font-caption">取消选择</span>
               </StSpace>
            </StButton>
         </StSpace>
         <StScrollable fill scroll class="bg-accent-600 rounded-[0.25rem] p-2">
            <StCodePreview
               v-show="!previewImageBase64"
               :code="previewCode"
               :language="previewCodeLang" />
            <StSpace v-if="previewImageBase64" fill center>
               <img
                  :src="previewImageBase64"
                  class="max-h-[20rem] max-w-[20rem] object-contain" />
            </StSpace>
         </StScrollable>
      </StSpace>
   </div>
</template>
