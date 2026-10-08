<script setup lang="ts">
import { History } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import type { ITableColumn } from '~/components/st/Table/type';
import type { ICloudFunctionVersionRow } from '../_composables/use-cloud-function-detail';

/** 「版本历史」卡片：列出所有版本，可把某版本设为生效。 */
defineProps<{
   versions: ICloudFunctionVersionRow[];
   /** 当前生效版本号；没有则为 undefined */
   activeVersion?: number;
   loading: boolean;
   /** 正在切换的版本号 */
   activating: number | null;
}>();

const emits = defineEmits<{
   activate: [version: number];
}>();

const columns: ITableColumn[] = [
   {
      key: 'version',
      title: '版本',
      width: '6rem',
      align: 'center',
      skeletonClass: 'h-5 w-[3rem] rounded-md mx-auto',
   },
   {
      key: 'hash',
      title: '源码指纹',
      width: '9rem',
      skeletonClass: 'h-5 w-[4rem] rounded-md',
   },
   {
      key: 'createdBy',
      title: '发布者',
      skeletonClass: 'h-6 w-[6rem] rounded-md',
   },
   {
      key: 'createdAt',
      title: '发布时间',
      width: '10rem',
      align: 'center',
      skeletonClass: 'h-5 w-[7rem] rounded-md mx-auto',
   },
   {
      key: 'action',
      title: '操作',
      width: '7rem',
      align: 'center',
      skeletonClass: 'h-5 w-[4rem] rounded-md mx-auto',
   },
];
</script>

<template>
   <section class="w-full rounded-2xl border border-accent-500 p-6">
      <StSpace align="center" gap="0.625rem" class="mb-5">
         <History class="text-[1.375rem] text-accent-200" />
         <h2 class="st-font-third-bold text-white">版本历史</h2>
      </StSpace>

      <StTable
         :columns="columns"
         :rows="versions"
         :loading="loading"
         row-key="version"
         :skeleton-count="3"
         empty-text="还没有发布任何版本">
         <template #cell-version="{ row }">
            <span class="font-mono whitespace-nowrap text-accent-100">
               v{{ row.version }}
            </span>
         </template>
         <template #cell-hash="{ row }">
            <span class="font-mono st-font-caption text-accent-300">
               {{ row.sourceHash.slice(0, 8) }}
            </span>
         </template>
         <template #cell-createdBy="{ row }">
            <StSpace align="center" gap="0.5rem" class="min-w-0">
               <StAvatar :url="row.creatorAvatarUrl" size="1.75rem" />
               <span class="truncate st-font-caption text-accent-200">
                  {{ row.creatorName }}
               </span>
            </StSpace>
         </template>
         <template #cell-createdAt="{ row }">
            <span class="st-font-caption text-accent-300">
               {{ dayjs(row.createdAt).format('YYYY-MM-DD HH:mm') }}
            </span>
         </template>
         <template #cell-action="{ row }">
            <StTextButton
               v-if="row.version !== activeVersion"
               :text="activating === row.version ? '切换中…' : '设为生效'"
               @click="emits('activate', row.version)" />
            <span v-else class="st-font-caption text-accent-400">
               当前版本
            </span>
         </template>

         <template #skeleton-createdBy="{ itemClass }">
            <StSpace align="center" gap="0.5rem">
               <StSkeletonItem class="size-7 rounded-full" :class="itemClass" />
               <StSkeletonItem class="h-4 w-[4rem] rounded-md" :class="itemClass" />
            </StSpace>
         </template>
      </StTable>
   </section>
</template>
