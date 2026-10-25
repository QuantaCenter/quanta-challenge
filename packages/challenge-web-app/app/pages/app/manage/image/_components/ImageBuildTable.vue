<script setup lang="ts">
import { Box, Delete, PreviewOpen, Write } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import type { ITableColumn } from '~/components/st/Table/type';
import type { ImageBuildRow } from '../_composables/use-image-build-admin';

defineProps<{
   builds: ImageBuildRow[];
   loading: boolean;
   removingId: string | null;
}>();

const emits = defineEmits<{
   view: [row: ImageBuildRow];
   edit: [row: ImageBuildRow];
   remove: [row: ImageBuildRow];
}>();

const fmtSize = (bytes?: number | null) => {
   if (!bytes && bytes !== 0) return '-';
   return bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${(bytes / 1024).toFixed(1)} KB`;
};

const columns: ITableColumn[] = [
   // 名称列为两行，使用自定义骨架
   { key: 'name', title: '快照镜像' },
   {
      key: 'status',
      title: '状态',
      width: '6rem',
      align: 'center',
      skeletonClass: 'h-6 w-[3rem] rounded-md mx-auto',
   },
   // 大小 / 使用题目 / 更新时间三列在移动端通过 CSS 隐藏（SSR 安全）
   {
      key: 'size',
      title: '大小（压缩后）',
      width: '8.5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[4.5rem] rounded-md mx-auto',
      class: 'max-md:hidden',
   },
   {
      key: 'references',
      title: '使用题目',
      width: '6.5rem',
      align: 'center',
      skeletonClass: 'h-6 w-[2.5rem] rounded-md mx-auto',
      class: 'max-md:hidden',
   },
   {
      key: 'updatedAt',
      title: '更新时间',
      width: '9.5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[7rem] rounded-md mx-auto',
      class: 'max-md:hidden',
   },
   // 操作列使用自定义骨架
   { key: 'action', title: '操作', width: '8.5rem', align: 'center' },
];

const actionClass =
   'flex items-center justify-center size-8 rounded-md text-accent-300 transition-all hover:bg-accent-500 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
</script>

<template>
   <StTable :columns="columns" :rows="builds" :loading="loading" row-key="id" :skeleton-count="4">
      <template #cell-name="{ row }">
         <StSpace direction="vertical" gap="0.125rem" class="min-w-0">
            <button
               type="button"
               class="truncate text-left st-font-body-bold text-white transition-colors hover:text-secondary cursor-pointer"
               @click="emits('view', row)">
               {{ row.name }}
            </button>
            <span class="truncate st-font-caption text-accent-300">
               {{ row.description || '暂无备注' }}
            </span>
            <span class="truncate font-mono text-[0.6875rem] text-accent-400">
               {{ row.id }}
            </span>
         </StSpace>
      </template>
      <template #cell-status="{ row }">
         <span
            class="rounded-md px-2 py-0.5 st-font-caption"
            :class="
               row.status === 'ready'
                  ? 'bg-success/15 text-success'
                  : 'bg-accent-500 text-accent-300'
            ">
            {{ row.status === 'ready' ? '可用' : '待上传' }}
         </span>
      </template>
      <template #cell-size="{ row }">
         <StSpace direction="vertical" gap="0" align="center">
            <span class="st-font-body-normal text-white">
               {{ fmtSize(row.compressedSizeBytes) }}
            </span>
            <span class="st-font-caption text-accent-400">
               原始 {{ fmtSize(row.sizeBytes) }}
            </span>
         </StSpace>
      </template>
      <template #cell-references="{ row }">
         <span
            class="rounded-md px-2 py-0.5 st-font-caption"
            :class="
               row.referenceCount
                  ? 'bg-primary/15 text-primary'
                  : 'text-accent-400'
            ">
            {{ row.referenceCount ? `${row.referenceCount} 道` : '未使用' }}
         </span>
      </template>
      <template #cell-updatedAt="{ row }">
         <span class="st-font-caption text-accent-300">
            {{ dayjs(row.updatedAt).format('YYYY-MM-DD HH:mm') }}
         </span>
      </template>
      <template #cell-action="{ row }">
         <StSpace align="center" justify="center" gap="0.5rem">
            <StPopover content="查看构建文件" placement="top">
               <button
                  type="button"
                  :class="[actionClass, 'hover:text-white']"
                  @click="emits('view', row)">
                  <PreviewOpen class="text-[1.125rem]" />
               </button>
            </StPopover>
            <StPopover content="编辑并重新发布" placement="top">
               <button
                  type="button"
                  :class="[actionClass, 'hover:text-secondary']"
                  @click="emits('edit', row)">
                  <Write class="text-[1.125rem]" />
               </button>
            </StPopover>
            <StPopover content="删除" placement="top">
               <button
                  type="button"
                  :disabled="removingId === row.id"
                  :class="[actionClass, 'hover:text-error']"
                  @click="emits('remove', row)">
                  <Delete class="text-[1.125rem]" />
               </button>
            </StPopover>
         </StSpace>
      </template>
      <template #skeleton-name="{ itemClass }">
         <StSpace direction="vertical" gap="0.5rem">
            <StSkeletonItem class="h-5 w-[8rem] rounded-md" :class="itemClass" />
            <StSkeletonItem class="h-4 w-[14rem] rounded-md" :class="itemClass" />
         </StSpace>
      </template>
      <template #skeleton-action="{ itemClass }">
         <StSpace align="center" justify="center" gap="0.75rem">
            <StSkeletonItem class="size-5 rounded-md" :class="itemClass" />
            <StSkeletonItem class="size-5 rounded-md" :class="itemClass" />
            <StSkeletonItem class="size-5 rounded-md" :class="itemClass" />
         </StSpace>
      </template>
      <template #empty>
         <StSpace
            fill
            direction="vertical"
            gap="0.75rem"
            align="center"
            justify="center"
            class="my-[10vh] text-accent-400">
            <Box size="2.625rem" />
            <div class="st-font-body-normal">还没有快照镜像，点击右上角「新建快照镜像」创建一个</div>
         </StSpace>
      </template>
   </StTable>
</template>
