<script setup lang="ts">
import { Code, Delete, Write } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import type { ITableColumn } from '~/components/st/Table/type';
import type { CloudFunctionRow } from '~/types/cloud-function';

defineProps<{
   functions: CloudFunctionRow[];
   loading: boolean;
   /** 正在启停的函数名，用于禁用对应开关 */
   togglingName: string | null;
}>();

const emits = defineEmits<{
   toggle: [name: string, enabled: boolean];
   remove: [name: string];
}>();

const columns: ITableColumn[] = [
   // 名称列是两行（函数名 + 描述），骨架用 #skeleton-name 自定义插槽
   { key: 'name', title: '函数' },
   {
      key: 'version',
      title: '版本',
      width: '6rem',
      align: 'center',
      skeletonClass: 'h-6 w-[2rem] rounded-md mx-auto',
   },
   {
      key: 'isolation',
      title: 'KV 隔离',
      width: '7.5rem',
      align: 'center',
      skeletonClass: 'h-6 w-[4.5rem] rounded-md mx-auto',
   },
   {
      key: 'status',
      title: '状态',
      width: '6.5rem',
      align: 'center',
      skeletonClass: 'h-6 w-[2.75rem] rounded-lg mx-auto',
   },
   {
      key: 'updatedAt',
      title: '更新时间',
      width: '10rem',
      align: 'center',
      skeletonClass: 'h-5 w-[7rem] rounded-md mx-auto',
   },
   // 操作列是两个图标按钮，骨架用 #skeleton-action 自定义插槽
   {
      key: 'action',
      title: '操作',
      width: '6.5rem',
      align: 'center',
   },
];
</script>

<template>
   <StSpace direction="vertical" gap="1rem" class="w-full">
      <StSpace align="center" gap="0.625rem">
         <Code class="text-[1.375rem] text-accent-200" />
         <h2 class="st-font-third-bold text-white">函数</h2>
      </StSpace>

      <StTable
         :columns="columns"
         :rows="functions"
         :loading="loading"
         row-key="name"
         :skeleton-count="4">
         <template #cell-name="{ row }">
            <StSpace direction="vertical" gap="0.125rem" class="min-w-0">
               <NuxtLink
                  :to="`/app/publish/cloud-function/${row.name}`"
                  class="truncate font-mono st-font-body-bold text-white transition-colors hover:text-secondary">
                  {{ row.name }}
               </NuxtLink>
               <span class="truncate st-font-body-normal text-accent-300">
                  {{ row.description || '暂无描述' }}
               </span>
            </StSpace>
         </template>
         <template #cell-version="{ row }">
            <span
               v-if="row.activeVersion"
               class="rounded-md bg-secondary/15 px-2 py-0.5 font-mono st-font-caption text-secondary">
               v{{ row.activeVersion.version }}
            </span>
            <span v-else class="st-font-caption text-accent-400">未发布</span>
         </template>
         <template #cell-isolation="{ row }">
            <span
               class="rounded-md px-2 py-0.5 st-font-caption"
               :class="
                  row.kvUserIsolated
                     ? 'bg-secondary/15 text-secondary'
                     : 'bg-primary/15 text-primary'
               ">
               {{ row.kvUserIsolated ? '用户隔离' : '共享' }}
            </span>
         </template>
         <template #cell-status="{ row }">
            <StPopover
               :content="row.enabled ? '点击停用' : '点击启用'"
               placement="top">
               <div class="flex justify-center">
                  <StSwitch
                     :model-value="row.enabled"
                     :disabled="togglingName === row.name"
                     @update:model-value="
                        (value) => emits('toggle', row.name, value)
                     " />
               </div>
            </StPopover>
         </template>
         <template #cell-updatedAt="{ row }">
            <span class="st-font-caption text-accent-300">
               {{ dayjs(row.updatedAt).format('YYYY-MM-DD HH:mm') }}
            </span>
         </template>
         <template #cell-action="{ row }">
            <StSpace align="center" justify="center" gap="0.75rem">
               <StPopover content="编辑并发布" placement="top">
                  <button
                     type="button"
                     class="flex items-center justify-center size-8 rounded-md text-accent-300 transition-all hover:bg-accent-500 hover:text-secondary active:scale-95 cursor-pointer"
                     @click="
                        navigateTo(`/app/publish/cloud-function/${row.name}`)
                     ">
                     <Write class="text-[1.125rem]" />
                  </button>
               </StPopover>
               <StPopover content="删除" placement="top">
                  <button
                     type="button"
                     class="flex items-center justify-center size-8 rounded-md text-accent-300 transition-all hover:bg-accent-500 hover:text-error active:scale-95 cursor-pointer"
                     @click="emits('remove', row.name)">
                     <Delete class="text-[1.125rem]" />
                  </button>
               </StPopover>
            </StSpace>
         </template>
         <template #skeleton-name="{ itemClass }">
            <StSpace direction="vertical" gap="0.5rem">
               <StSkeletonItem
                  class="h-5 w-[6rem] rounded-md"
                  :class="itemClass" />
               <StSkeletonItem
                  class="h-5 w-[11rem] rounded-md"
                  :class="itemClass" />
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
               <Code size="2.625rem" />
               <div class="st-font-body-normal">
                  还没有云函数，去「发布流程」创建一个
               </div>
            </StSpace>
         </template>
      </StTable>
   </StSpace>
</template>
