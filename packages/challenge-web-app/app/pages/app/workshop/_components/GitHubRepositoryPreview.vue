<script setup lang="ts">
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '~~/server/trpc/routes';
import type { IFileSystemItem } from '~/components/st/FileSystemTree/type';
import { LoadingFour, Refresh } from '@icon-park/vue-next';
import { formatFileSize } from '~/utils/format-file-size';

type Preview = inferRouterOutputs<AppRouter>['protected']['github']['preview'];

const props = defineProps<{
   preview: Preview | null;
   pending: boolean;
   failure: string;
}>();

const emit = defineEmits<{
   refresh: [];
}>();

const entriesByPath = computed(() => {
   return new Map(
      props.preview?.entries.map((entry) => [
         entry.path,
         entry,
      ]) ?? [],
   );
});

const entrySize = (path: string) => {
   const sizeBytes = entriesByPath.value.get(path)?.sizeBytes;

   return sizeBytes == null ? '未知' : formatFileSize(sizeBytes);
};

const directory = computed(() => {
   const root: IFileSystemItem[] = [];
   const folders = new Map<string, IFileSystemItem>();

   for (const entry of props.preview?.entries ?? []) {
      const parts = entry.path.split('/');
      let siblings = root;

      for (let index = 0; index < parts.length; index++) {
         const path = parts.slice(0, index + 1).join('/');
         const isFolder =
            index < parts.length - 1 || entry.kind === 'directory';

         if (isFolder) {
            let folder = folders.get(path);

            if (!folder) {
               folder = {
                  name: parts[index]!,
                  path,
                  type: 'folder',
                  children: [],
               };
               folders.set(path, folder);
               siblings.push(folder);
            }

            siblings = folder.children!;
         } else {
            siblings.push({
               name: parts[index]!,
               path,
               type: 'file',
            });
         }
      }
   }

   return root;
});

const capacityPercent = computed(() => {
   if (props.preview?.sizeBytes == null || !props.preview.maxProjectBytes) {
      return null;
   }

   return (props.preview.sizeBytes / props.preview.maxProjectBytes) * 100;
});

const capacityColor = computed(() => {
   if (capacityPercent.value === null) {
      return 'bg-primary';
   }
   if (capacityPercent.value > 100) {
      return 'bg-error';
   }
   if (capacityPercent.value >= 80) {
      return 'bg-warning';
   }

   return 'bg-primary';
});
</script>

<template>
   <section
      aria-label="仓库目录预览"
      class="min-w-0 overflow-hidden rounded-xl border border-accent-400">
      <div class="flex items-center justify-between gap-3 px-4 pt-4">
         <h3 class="text-sm font-medium">目录与大小</h3>
         <StButton
            size="sm"
            aria-label="刷新预览"
            title="刷新预览"
            class="!size-8 !rounded-lg !p-2 !bg-transparent !text-accent-300"
            :disabled="pending"
            @click="emit('refresh')">
            <Refresh
               class="block text-base"
               :class="{ 'animate-spin': pending }"
               aria-hidden="true" />
         </StButton>
      </div>

      <div
         v-if="pending"
         role="status"
         class="flex items-center justify-center gap-2 px-4 py-10 text-sm text-accent-300">
         <LoadingFour
            class="animate-spin text-primary"
            aria-hidden="true" />
         正在读取目录与文件大小…
      </div>
      <p
         v-else-if="failure"
         role="alert"
         class="m-4 rounded-lg bg-error/10 p-3 text-sm text-error">
         {{ failure }}
      </p>

      <template v-else-if="preview">
         <div class="space-y-3 px-4 pb-4 pt-3">
            <div class="flex flex-wrap items-end justify-between gap-2">
               <div>
                  <p class="text-xs text-accent-300">预计导入</p>
                  <p
                     class="mt-1 text-2xl font-semibold tabular-nums font-family-manrope"
                     :class="capacityPercent !== null && capacityPercent > 100 ? 'text-error' : ''">
                     {{
                        preview.sizeBytes === null
                           ? '大小未知'
                           : formatFileSize(preview.sizeBytes)
                     }}
                  </p>
               </div>
               <span class="text-xs text-accent-300">
                  {{ preview.fileCount }}
                  个文件
               </span>
            </div>

            <template v-if="capacityPercent !== null">
               <div
                  role="meter"
                  aria-label="导入容量占用"
                  :aria-valuenow="Math.min(capacityPercent, 100)"
                  :aria-valuemin="0"
                  :aria-valuemax="100"
                  :aria-valuetext="`${capacityPercent.toFixed(1)}%，上限 ${formatFileSize(preview.maxProjectBytes)}`"
                  class="h-1.5 overflow-hidden rounded-full bg-accent-500">
                  <div
                     class="h-full rounded-full transition-[width] motion-reduce:transition-none"
                     :class="capacityColor"
                     :style="{ width: `${Math.min(capacityPercent, 100)}%` }" />
               </div>
               <div class="flex justify-between gap-2 text-xs text-accent-300">
                  <span
                     >容量上限
                     {{ formatFileSize(preview.maxProjectBytes) }}</span
                  >
                  <span class="tabular-nums"
                     >{{ capacityPercent.toFixed(1) }}%</span
                  >
               </div>
            </template>

            <p
               v-if="preview.reason"
               role="alert"
               class="rounded-lg bg-error/10 px-3 py-2 text-xs leading-relaxed text-error">
               {{ preview.reason }}
            </p>
         </div>

         <template v-if="preview.entries.length">
            <div
               class="flex justify-between border-y border-accent-400 bg-accent-500/40 px-4 py-2 text-xs text-accent-300">
               <span>文件目录</span>
               <span>大小</span>
            </div>
            <div
               class="max-h-64 overflow-auto p-2"
               aria-label="文件和目录大小">
               <StFileSystemTree
                  :key="preview.commitSha"
                  :directory="directory"
                  read-only>
                  <template #item-extra="{ item }">
                     <span
                        v-if="entriesByPath.get(item.path)?.excluded"
                        class="rounded bg-accent-500 px-1.5 py-0.5 text-[10px] text-accent-300">
                        不导入
                     </span>
                     <span class="text-xs tabular-nums text-accent-300">
                        {{ entrySize(item.path) }}
                     </span>
                  </template>
               </StFileSystemTree>
            </div>
         </template>
         <p
            v-else-if="preview.canImport"
            class="px-4 pb-4 text-sm text-accent-300">
            该分支没有文件。
         </p>
      </template>

      <p
         class="border-t border-accent-400 px-4 py-3 text-xs leading-relaxed text-accent-300">
         按文件原始大小统计，排除 .git 和 node_modules。目录大小包含全部子文件。
      </p>
   </section>
</template>
