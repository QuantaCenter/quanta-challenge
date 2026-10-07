<script setup lang="ts">
import { Box, Delete, Edit, Tag } from '@icon-park/vue-next';
import { dialog } from '~/composables/use-dialog';
import { useMessage } from '~/components/st/Message/use-message';
import type { ITableColumn } from '~/components/st/Table/type';
import { logger } from '~~/lib/logger';
import TagEditingDrawer, {
   type ITagEditingTarget,
} from '~/components/tag/TagEditingDrawer.vue';
import { textColorOn } from './_utils/color';

useSeoMeta({ title: '标签管理 - Quanta Challenge' });

const columns: ITableColumn[] = [
   {
      key: 'icon',
      title: '图标',
      width: '5rem',
      skeletonClass: 'size-[2.25rem] rounded-lg',
   },
   { key: 'label', title: '标签名', width: '10rem' },
   { key: 'description', title: '描述', skeletonClass: 'h-5 w-[12rem] rounded-md' },
   { key: 'color', title: '颜色', width: '8.5rem' },
   { key: 'action', title: '操作', width: '7rem', align: 'center' },
];

const { $trpc } = useNuxtApp();
const message = useMessage();
const runtimeConfig = useRuntimeConfig();
const appBaseUrl = runtimeConfig.public.appBaseUrl;

const {
   data: rawTags,
   pending,
   error,
   refresh,
} = useAsyncData('manage-tags', () => $trpc.public.tag.list.query());

// 监听错误
watch(
   error,
   (newError) => {
      if (newError) {
         logger.error(newError, '加载标签失败');
         message.error('标签加载失败', '请检查网络连接或稍后重试');
      }
   },
   { immediate: true }
);

const tagOptions = computed(() => {
   if (!rawTags.value) return [];

   return rawTags.value
      .map((tag) => ({
         label: tag.name,
         value: tag.tid,
         description: tag.description,
         color: tag.color ?? '#FA7C0E',
         imageId: tag.imageId,
         imageUrl: tag.url ? `${appBaseUrl}${tag.url}` : undefined,
      }))
      .toSorted((a, b) => a.label.localeCompare(b.label));
});

const editingTag = ref<ITagEditingTarget | null>(null);
const isEditingDrawerShow = ref(false);

const editTag = (tag: (typeof tagOptions.value)[number]) => {
   editingTag.value = {
      tid: tag.value,
      name: tag.label,
      color: tag.color,
      description: tag.description,
      imageId: tag.imageId,
      imageUrl: tag.imageUrl,
   };
   isEditingDrawerShow.value = true;
};

const handleSaved = async () => {
   await refresh();
   message.success('保存成功');
};

const deleteTag = async (tid: number) => {
   const confirmed = await dialog.confirm({
      title: '删除标签',
      description: '确定要删除这个标签吗？此操作不可撤销。',
      variant: 'danger',
      confirmText: '删除',
      cancelText: '取消',
   });

   if (!confirmed) return;

   const loading = message.info('正在删除...', '', {
      duration: 0,
      loading: true,
   });

   try {
      await $trpc.admin.tag.delete.mutate({ tid });
      loading.close();
      await refresh();
      message.success('删除成功');
   } catch (error) {
      loading.close();
      logger.error(error, '删除标签失败');
      const errorCode = (error as any)?.data?.code;

      if (errorCode === 'UNAUTHORIZED' || errorCode === 'FORBIDDEN') {
         message.error('删除失败', '您没有管理员权限');
      } else if (errorCode === 'NOT_FOUND') {
         message.error('删除失败', '找不到该标签（可能已被删除）');
      } else {
         message.error('删除失败', '请稍后重试');
      }
   }
};
</script>

<template>
   <StSpace fill justify="center">
      <StSpace direction="vertical" gap="1.5rem" class="w-[44rem] pb-[10rem] my-6">
         <StSpace align="end" gap="1rem">
            <h1 class="st-font-hero-bold text-accent-100">标签管理</h1>
            <span
               class="st-font-caption text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full">
               共 {{ tagOptions.length }} 个标签
            </span>
         </StSpace>

         <StTable
            :columns="columns"
            :rows="tagOptions"
            :loading="pending"
            row-key="value"
            :skeleton-count="5">
            <template #cell-icon="{ row }">
               <div
                  class="flex items-center justify-center size-[2.25rem] bg-accent-700 rounded-lg border border-accent-500 overflow-hidden">
                  <img
                     v-if="row.imageUrl"
                     class="size-[1.75rem] object-contain"
                     :src="row.imageUrl"
                     :alt="`${row.label} 标签图标`" />
                  <Box v-else class="text-accent-400" />
               </div>
            </template>

            <template #cell-label="{ row }">
               <div class="st-font-body-bold text-white truncate">
                  {{ row.label }}
               </div>
            </template>

            <template #cell-description="{ row }">
               <div class="st-font-body-normal text-accent-300 truncate">
                  {{ row.description || '暂无描述' }}
               </div>
            </template>

            <template #cell-color="{ row }">
               <span
                  class="inline-flex items-center justify-center px-3 py-1 rounded-md font-mono st-font-tooltip"
                  :style="{
                     backgroundColor: row.color,
                     color: textColorOn(row.color),
                  }">
                  {{ row.color }}
               </span>
            </template>

            <template #cell-action="{ row }">
               <StSpace align="center" justify="center" gap="1.25rem">
                  <button
                     type="button"
                     title="编辑标签"
                     aria-label="编辑标签"
                     class="flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 hover:text-secondary active:scale-95 transition-all cursor-pointer"
                     @click="editTag(row)">
                     <Edit class="text-[1.25rem]" />
                  </button>
                  <button
                     type="button"
                     title="删除标签"
                     aria-label="删除标签"
                     class="flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 hover:text-error active:scale-95 transition-all cursor-pointer"
                     @click="deleteTag(row.value)">
                     <Delete class="text-[1.25rem]" />
                  </button>
               </StSpace>
            </template>

            <template #skeleton-action="{ itemClass }">
               <StSpace align="center" justify="center" gap="1.25rem">
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
                  class="text-accent-400 my-[20vh]">
                  <Tag size="2.625rem" />
                  <div class="st-font-body-normal">暂无标签</div>
               </StSpace>
            </template>
         </StTable>
      </StSpace>

      <TagEditingDrawer
         v-model:opened="isEditingDrawerShow"
         :tag="editingTag"
         @saved="handleSaved" />
   </StSpace>
</template>
