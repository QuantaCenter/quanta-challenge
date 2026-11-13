<script setup lang="ts">
import type { DefineComponent } from 'vue';
import {
   Box,
   Delete,
   Edit,
   Experiment,
   Plus,
   Tag,
   TableReport,
   ThreeHexagons,
} from '@icon-park/vue-next';
import { dialog } from '~/composables/use-dialog';
import { useMessage } from '~/components/st/Message/use-message';
import type { ITableColumn } from '~/components/st/Table/type';
import { logger } from '~~/lib/logger';
import TagEditingDrawer, {
   type ITagEditingTarget,
} from '~/components/tag/TagEditingDrawer.vue';
import { textColorOn } from './_utils/color';
import LabTagTable from './_components/LabTagTable.vue';
import LabCategoryTable from './_components/LabCategoryTable.vue';

useSeoMeta({ title: '标签管理 - Quanta Challenge' });

const route = useRoute();
const router = useRouter();

/**
 * 标签分类页签，与 ?scope= 同步，便于从发布页直接跳转：
 * - problem：题目标签；
 * - lab-category：模板分类（实验室页的分类页签、卡片右上角的分类标签）；
 * - lab：实验室技术栈标签（模板卡片底部的小标签）。
 */
type ManageScope = 'problem' | 'lab-category' | 'lab';
const scopeTabs = [
   { label: '题目标签', value: 'problem', icon: TableReport as DefineComponent },
   { label: '模板分类', value: 'lab-category', icon: ThreeHexagons as DefineComponent },
   { label: '技术栈标签', value: 'lab', icon: Experiment as DefineComponent },
];
const scope = computed<ManageScope>({
   get: () =>
      route.query.scope === 'lab' || route.query.scope === 'lab-category'
         ? route.query.scope
         : 'problem',
   set: (value) => {
      router.replace({
         query: { ...route.query, scope: value === 'problem' ? undefined : value },
      });
   },
});

const labTable = useTemplateRef('lab-table');
const categoryTable = useTemplateRef('category-table');
const labTagCount = ref<number | null>(null);
const categoryCount = ref<number | null>(null);
const handleCreate = () => {
   if (scope.value === 'lab') {
      labTable.value?.openCreate();
      return;
   }
   if (scope.value === 'lab-category') {
      categoryTable.value?.openCreate();
      return;
   }
   editingTag.value = null;
   isEditingDrawerShow.value = true;
};
const createLabel = computed(
   () =>
      ({ problem: '新建标签', 'lab-category': '新建模板分类', lab: '新建技术栈标签' })[
         scope.value
      ],
);
const totalCount = computed(() =>
   scope.value === 'lab'
      ? (labTagCount.value ?? 0)
      : scope.value === 'lab-category'
        ? (categoryCount.value ?? 0)
        : tagOptions.value.length,
);

const columns: ITableColumn[] = [
   // 描述 / 颜色两列在移动端通过 CSS 隐藏（SSR 安全）；图标列保留展示
   {
      key: 'icon',
      title: '图标',
      width: '5rem',
      skeletonClass: 'size-[2.25rem] rounded-lg',
   },
   { key: 'label', title: '标签名', width: '10rem' },
   {
      key: 'description',
      title: '描述',
      skeletonClass: 'h-5 w-[12rem] rounded-md',
      class: 'max-md:hidden',
   },
   { key: 'color', title: '颜色', width: '8.5rem', class: 'max-md:hidden' },
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
      scope: 'problem',
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
      <StSpace direction="vertical" gap="1.5rem" class="w-full max-w-[44rem] pb-[10rem] my-6 max-md:my-4 max-md:px-4 max-md:gap-4!">
         <StSpace fill-x align="end" justify="between" gap="1rem">
            <StSpace align="end" gap="1rem">
               <h1 class="st-font-hero-bold text-accent-100 max-md:text-[1.5rem] max-md:leading-[1.2]">标签管理</h1>
               <span
                  class="st-font-caption text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full">
                  共 {{ totalCount }} 个{{ scope === 'lab-category' ? '分类' : '标签' }}
               </span>
            </StSpace>
            <StButton
               class="shrink-0 py-[0.375rem] px-[1rem] text-accent-100 !rounded-[0.375rem] mb-1"
               @click="handleCreate">
               <div class="flex gap-2 items-center">
                  <Plus class="text-[1.25rem]" />
                  <span>{{ createLabel }}</span>
               </div>
            </StButton>
         </StSpace>

         <StTabs v-model="scope" :options="scopeTabs" />

         <LabCategoryTable
            v-if="scope === 'lab-category'"
            ref="category-table"
            @count="(count) => (categoryCount = count)" />

         <LabTagTable
            v-else-if="scope === 'lab'"
            ref="lab-table"
            @count="(count) => (labTagCount = count)" />

         <StTable
            v-else
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
               <div class="st-font-body-normal text-white truncate">
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
         scope="problem"
         @saved="handleSaved" />
   </StSpace>
</template>
