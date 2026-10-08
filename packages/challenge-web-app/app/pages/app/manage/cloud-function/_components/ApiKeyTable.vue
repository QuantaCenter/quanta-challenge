<script setup lang="ts">
import { Copy, Delete, Key, Plus } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import type { ITableColumn } from '~/components/st/Table/type';
import { useMessage } from '~/components/st/Message/use-message';
import { SCOPE_META } from '../_utils/scopes';
import type { CloudFunctionApiKeyRow } from '~/types/cloud-function';

defineProps<{
   keys: CloudFunctionApiKeyRow[];
   loading: boolean;
}>();

const emits = defineEmits<{
   /** 点击「签发新 Key」，由页面打开签发抽屉 */
   create: [];
   revoke: [keyId: string, name: string];
}>();

const message = useMessage();

const columns: ITableColumn[] = [
   // 名称列是两行（名称 + 创建日期），骨架用 #skeleton-name 自定义插槽
   { key: 'name', title: '名称', width: '11rem' },
   { key: 'keyId', title: 'Key ID', skeletonClass: 'h-5 w-[11rem] rounded-md' },
   {
      key: 'scopes',
      title: '权限',
      width: '10rem',
      skeletonClass: 'h-6 w-[5rem] rounded-md',
   },
   {
      key: 'expiresAt',
      title: '有效期',
      width: '9rem',
      align: 'center',
      skeletonClass: 'h-5 w-[5.5rem] rounded-md mx-auto',
   },
   {
      key: 'action',
      title: '操作',
      width: '5rem',
      align: 'center',
      skeletonClass: 'size-5 rounded-md mx-auto',
   },
];

const copyText = async (text: string, tip: string) => {
   try {
      await navigator.clipboard.writeText(text);
      message.success(tip);
   } catch {
      message.error('复制失败', '请手动选择复制');
   }
};
</script>

<template>
   <StSpace direction="vertical" gap="1rem" class="w-full">
      <StSpace align="center" justify="between" class="w-full">
         <StSpace align="center" gap="0.625rem">
            <Key class="text-[1.375rem] text-accent-200" />
            <h2 class="st-font-third-bold text-white">API Key</h2>
         </StSpace>
         <StButton
            class="py-[0.375rem] px-[1rem] text-accent-100 !rounded-[0.5rem]"
            @click="emits('create')">
            <div class="flex gap-2 items-center">
               <Plus class="text-[1.25rem]" />
               <span>签发新 Key</span>
            </div>
         </StButton>
      </StSpace>

      <StTable
         :columns="columns"
         :rows="keys"
         :loading="loading"
         row-key="keyId"
         :skeleton-count="3">
         <template #cell-name="{ row }">
            <StSpace direction="vertical" gap="0.125rem">
               <span class="st-font-body-bold text-white">{{ row.name }}</span>
               <span class="st-font-caption text-accent-400">
                  {{ dayjs(row.createdAt).format('YYYY-MM-DD') }}
               </span>
            </StSpace>
         </template>
         <template #cell-keyId="{ row }">
            <StSpace align="center" gap="0.5rem" class="min-w-0">
               <span class="truncate font-mono text-accent-300">
                  {{ row.keyId }}
               </span>
               <StPopover content="复制 Key ID" placement="top">
                  <button
                     type="button"
                     class="flex shrink-0 items-center justify-center size-6 rounded-md text-accent-400 transition-colors hover:bg-accent-500 hover:text-white cursor-pointer"
                     @click="copyText(row.keyId, '已复制 Key ID')">
                     <Copy class="text-[0.875rem]" />
                  </button>
               </StPopover>
            </StSpace>
         </template>
         <template #cell-scopes="{ row }">
            <StSpace gap="0.375rem" wrap>
               <span
                  v-for="scope in row.scopes"
                  :key="scope"
                  class="rounded-md px-2 py-0.5 st-font-caption"
                  :class="
                     SCOPE_META[scope]?.color ?? 'bg-accent-500 text-accent-200'
                  ">
                  {{ SCOPE_META[scope]?.label ?? scope }}
               </span>
            </StSpace>
         </template>
         <template #cell-expiresAt="{ row }">
            <span class="st-font-caption text-accent-300">
               {{
                  row.expiresAt
                     ? dayjs(row.expiresAt).format('YYYY-MM-DD')
                     : '永久'
               }}
            </span>
         </template>
         <template #cell-action="{ row }">
            <StPopover content="撤销" placement="top">
               <button
                  type="button"
                  class="mx-auto flex items-center justify-center size-8 rounded-md text-accent-300 transition-all hover:bg-accent-500 hover:text-error active:scale-95 cursor-pointer"
                  @click="emits('revoke', row.keyId, row.name)">
                  <Delete class="text-[1.125rem]" />
               </button>
            </StPopover>
         </template>
         <template #skeleton-name="{ itemClass }">
            <StSpace direction="vertical" gap="0.5rem">
               <StSkeletonItem
                  class="h-5 w-[6rem] rounded-md"
                  :class="itemClass" />
               <StSkeletonItem
                  class="h-4 w-[5rem] rounded-md"
                  :class="itemClass" />
            </StSpace>
         </template>
         <template #empty>
            <StSpace
               fill
               direction="vertical"
               gap="0.75rem"
               align="center"
               justify="center"
               class="my-[8vh] text-accent-400">
               <Key size="2.625rem" />
               <div class="st-font-body-normal">暂无 API Key</div>
            </StSpace>
         </template>
      </StTable>
   </StSpace>
</template>
