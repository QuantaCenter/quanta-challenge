<script setup lang="ts">
import { Box, Delete, Experiment, Undo, Write } from '@icon-park/vue-next';
import { LAB_CATEGORY_FALLBACK } from '@challenge/shared/lab-templates';
import type { ITableColumn } from '~/components/st/Table/type';
import type { LabTemplateRow } from '../_composables/use-lab-template-admin';

defineProps<{
   templates: LabTemplateRow[];
   loading: boolean;
   /** 正在处理的模板 id，用于禁用对应开关与按钮 */
   busyId: string | null;
}>();

const emits = defineEmits<{
   toggle: [row: LabTemplateRow, enabled: boolean];
   edit: [row: LabTemplateRow];
   reset: [row: LabTemplateRow];
   remove: [row: LabTemplateRow];
}>();

const columns: ITableColumn[] = [
   // 名称列为多行，使用自定义骨架
   { key: 'name', title: '模板' },
   {
      key: 'type',
      title: '类型',
      width: '7rem',
      align: 'center',
      skeletonClass: 'h-6 w-[3rem] rounded-md mx-auto',
   },
   // 快照镜像 / 项目数在移动端通过 CSS 隐藏（SSR 安全）
   {
      key: 'snapshot',
      title: '快照镜像',
      width: '10rem',
      align: 'center',
      skeletonClass: 'h-5 w-[5rem] rounded-md mx-auto',
      class: 'max-md:hidden',
   },
   {
      key: 'projects',
      title: '项目数',
      width: '5.5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[2rem] rounded-md mx-auto',
      class: 'max-md:hidden',
   },
   {
      key: 'status',
      title: '启用',
      width: '5.5rem',
      align: 'center',
      skeletonClass: 'h-6 w-[2.75rem] rounded-lg mx-auto',
   },
   // 操作列使用自定义骨架
   { key: 'action', title: '操作', width: '8.5rem', align: 'center' },
];

const actionClass =
   'flex items-center justify-center size-8 rounded-md text-accent-300 transition-all hover:bg-accent-500 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';
</script>

<template>
   <StTable :columns="columns" :rows="templates" :loading="loading" row-key="id" :skeleton-count="6">
      <template #cell-name="{ row }">
         <StSpace align="center" gap="0.75rem" class="min-w-0">
            <StSpace center no-shrink class="size-10 rounded-lg bg-accent-600">
               <img :src="row.icon" :alt="row.name" class="size-6 object-contain" draggable="false" />
            </StSpace>
            <StSpace direction="vertical" gap="0.125rem" class="min-w-0">
               <StSpace align="center" gap="0.5rem" class="min-w-0">
                  <button
                     type="button"
                     class="truncate text-left st-font-body-normal text-white transition-colors hover:text-secondary cursor-pointer"
                     @click="emits('edit', row)">
                     {{ row.name }}
                  </button>
                  <StTag
                     size="small"
                     class="shrink-0"
                     contrast-text
                     :color="(row.categoryInfo ?? LAB_CATEGORY_FALLBACK).color"
                     :content="(row.categoryInfo ?? LAB_CATEGORY_FALLBACK).name" />
               </StSpace>
               <span class="truncate st-font-caption text-accent-300">
                  {{ row.description || '暂无简介' }}
               </span>
               <span class="truncate font-mono text-[0.6875rem] text-accent-400">
                  {{ row.id }} · {{ row.fileCount }} 个文件
               </span>
            </StSpace>
         </StSpace>
      </template>
      <template #cell-type="{ row }">
         <StSpace direction="vertical" gap="0.25rem" align="center">
            <span
               class="rounded-md px-2 py-0.5 st-font-caption"
               :class="row.builtin ? 'bg-accent-500 text-accent-200' : 'bg-secondary/15 text-secondary'">
               {{ row.builtin ? '内置' : '自定义' }}
            </span>
            <span v-if="row.customized" class="st-font-caption text-primary">已修改</span>
         </StSpace>
      </template>
      <template #cell-snapshot="{ row }">
         <span v-if="!row.snapshotImage" class="st-font-caption text-accent-400">未使用</span>
         <StPopover
            v-else
            :content="
               row.snapshotImage.status === 'ready' && row.snapshotImage.formatVersion === 0
                  ? row.snapshotImage.name
                  : `「${row.snapshotImage.name}」不可用，打开项目时会跳过挂载`
            "
            placement="top">
            <StSpace align="center" justify="center" gap="0.375rem" class="min-w-0">
               <Box
                  class="shrink-0"
                  :class="
                     row.snapshotImage.status === 'ready' && row.snapshotImage.formatVersion === 0
                        ? 'text-primary'
                        : 'text-error'
                  " />
               <span class="truncate st-font-caption text-accent-100">
                  {{ row.snapshotImage.name }}
               </span>
            </StSpace>
         </StPopover>
      </template>
      <template #cell-projects="{ row }">
         <span class="st-font-body-normal" :class="row.projectCount ? 'text-white' : 'text-accent-400'">
            {{ row.projectCount }}
         </span>
      </template>
      <template #cell-status="{ row }">
         <StPopover :content="row.enabled ? '点击停用' : '点击启用'" placement="top">
            <div class="flex justify-center" :class="{ 'pointer-events-none opacity-60': busyId === row.id }">
               <StSwitch
                  :model-value="row.enabled"
                  @update:model-value="(value: boolean) => emits('toggle', row, value)" />
            </div>
         </StPopover>
      </template>
      <template #cell-action="{ row }">
         <StSpace align="center" justify="center" gap="0.5rem">
            <StPopover :content="row.builtin ? '修改基础信息' : '编辑模板'" placement="top">
               <button
                  type="button"
                  :class="[actionClass, 'hover:text-secondary']"
                  @click="emits('edit', row)">
                  <Write class="text-[1.125rem]" />
               </button>
            </StPopover>
            <StPopover v-if="row.builtin" content="恢复默认配置" placement="top">
               <button
                  type="button"
                  :disabled="!row.customized || busyId === row.id"
                  :class="[actionClass, 'hover:text-white']"
                  @click="emits('reset', row)">
                  <Undo class="text-[1.125rem]" />
               </button>
            </StPopover>
            <StPopover v-else content="删除" placement="top">
               <button
                  type="button"
                  :disabled="busyId === row.id"
                  :class="[actionClass, 'hover:text-error']"
                  @click="emits('remove', row)">
                  <Delete class="text-[1.125rem]" />
               </button>
            </StPopover>
         </StSpace>
      </template>
      <template #skeleton-name="{ itemClass }">
         <StSpace align="center" gap="0.75rem">
            <StSkeletonItem class="size-10 rounded-lg" :class="itemClass" />
            <StSpace direction="vertical" gap="0.5rem">
               <StSkeletonItem class="h-5 w-[8rem] rounded-md" :class="itemClass" />
               <StSkeletonItem class="h-4 w-[14rem] rounded-md" :class="itemClass" />
            </StSpace>
         </StSpace>
      </template>
      <template #skeleton-action="{ itemClass }">
         <StSpace align="center" justify="center" gap="0.75rem">
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
            <Experiment size="2.625rem" />
            <div class="st-font-body-normal">暂无模板</div>
         </StSpace>
      </template>
   </StTable>
</template>
