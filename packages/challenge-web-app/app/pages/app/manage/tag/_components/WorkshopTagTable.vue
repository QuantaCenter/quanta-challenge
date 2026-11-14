<script setup lang="ts">
import { Delete, Edit, Plus, Tag } from '@icon-park/vue-next';
import { dialog } from '~/composables/use-dialog';
import { useMessage } from '~/components/st/Message/use-message';
import type { ITableColumn } from '~/components/st/Table/type';
import { logger } from '~~/lib/logger';
import TagEditingDrawer, {
   type ITagEditingTarget,
} from '~/components/tag/TagEditingDrawer.vue';

/**
 * 工坊标签管理：内置标签（代码维护）与已发布的工坊标签合并展示。
 * 内置标签可以「自定义」——创建同名工坊标签覆盖其图标与说明，删除后恢复为内置标签。
 */

const { $trpc } = useNuxtApp();
const message = useMessage();

const {
   data: tags,
   pending,
   error,
   refresh,
} = useAsyncData('manage-workshop-tags', () => $trpc.admin.tag.workshopList.query());

watch(
   error,
   (newError) => {
      if (newError) {
         logger.error(newError, '加载工坊标签失败');
         message.error('工坊标签加载失败', '请检查网络连接或稍后重试');
      }
   },
   { immediate: true },
);

type WorkshopTagRow = NonNullable<typeof tags.value>[number];

const emits = defineEmits<{ count: [count: number] }>();
watch(
   () => tags.value?.length,
   (count) => count !== undefined && emits('count', count),
   { immediate: true },
);

const columns: ITableColumn[] = [
   {
      key: 'icon',
      title: '图标',
      width: '5rem',
      skeletonClass: 'size-[2.25rem] rounded-lg',
   },
   { key: 'label', title: '标签名', width: '12rem' },
   {
      key: 'description',
      title: '描述',
      skeletonClass: 'h-5 w-[12rem] rounded-md',
      class: 'max-md:hidden',
   },
   {
      key: 'templates',
      title: '使用模板',
      width: '6.5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[2rem] rounded-md mx-auto',
      class: 'max-md:hidden',
   },
   { key: 'action', title: '操作', width: '7rem', align: 'center' },
];

const drawerOpened = ref(false);
const editingTag = ref<ITagEditingTarget | null>(null);
const defaultName = ref('');

const openCreate = (name = '') => {
   editingTag.value = null;
   defaultName.value = name;
   drawerOpened.value = true;
};

const openEdit = (row: WorkshopTagRow) => {
   if (row.tid === null) {
      // 内置标签：创建同名工坊标签进行覆盖
      openCreate(row.name);
      return;
   }
   editingTag.value = {
      tid: row.tid,
      name: row.name,
      description: row.description,
      imageId: row.imageId,
      imageUrl: row.imageId ? row.icon : null,
      scope: 'workshop',
   };
   drawerOpened.value = true;
};

const handleSaved = async () => {
   await refresh();
   message.success('保存成功');
};

const deletingTid = ref<number | null>(null);
const deleteTag = async (row: WorkshopTagRow) => {
   if (row.tid === null || deletingTid.value) return;
   const confirmed = await dialog.confirm({
      title: `删除工坊标签「${row.name}」？`,
      description: row.builtin
         ? '删除后恢复为内置标签（使用内置图标），已使用该标签的模板不受影响。'
         : row.templateCount
           ? `该标签会从 ${row.templateCount} 个自定义模板中移除，此操作不可撤销。`
           : '确定要删除这个标签吗？此操作不可撤销。',
      variant: 'danger',
      confirmText: '删除',
      cancelText: '取消',
   });
   if (!confirmed) return;

   deletingTid.value = row.tid;
   try {
      await $trpc.admin.tag.delete.mutate({ tid: row.tid });
      await refresh();
      message.success(row.builtin ? '已恢复为内置标签' : '删除成功');
   } catch (err) {
      logger.error(err, '删除工坊标签失败');
      const code = (err as any)?.data?.code;
      message.error(
         '删除失败',
         code === 'NOT_FOUND'
            ? '找不到该标签，或该标签不是由你创建的'
            : (err as Error)?.message || '请稍后重试',
      );
   } finally {
      deletingTid.value = null;
   }
};

defineExpose({ openCreate });

const actionClass =
   'flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';
</script>

<template>
   <StTable
      :columns="columns"
      :rows="tags ?? []"
      :loading="pending && !tags"
      row-key="name"
      :skeleton-count="6">
      <template #cell-icon="{ row }">
         <div
            class="flex items-center justify-center size-[2.25rem] bg-accent-700 rounded-lg border border-accent-500 overflow-hidden">
            <img
               v-if="row.icon"
               class="size-[1.5rem] object-contain"
               :src="row.icon"
               :alt="`${row.name} 标签图标`" />
            <Tag v-else class="text-accent-400" />
         </div>
      </template>

      <template #cell-label="{ row }">
         <StSpace align="center" gap="0.5rem" class="min-w-0">
            <span class="st-font-body-normal text-white truncate">{{ row.name }}</span>
            <span
               v-if="row.builtin"
               class="shrink-0 rounded-md px-1.5 py-0.5 text-[0.6875rem]"
               :class="row.tid === null ? 'bg-accent-500 text-accent-200' : 'bg-primary/15 text-primary'">
               {{ row.tid === null ? '内置' : '已覆盖内置' }}
            </span>
         </StSpace>
      </template>

      <template #cell-description="{ row }">
         <div class="st-font-body-normal text-accent-300 truncate">
            {{ row.description || (row.tid === null ? '内置技术栈标签' : '暂无描述') }}
         </div>
      </template>

      <template #cell-templates="{ row }">
         <span
            class="st-font-body-normal"
            :class="row.templateCount ? 'text-white' : 'text-accent-400'">
            {{ row.templateCount }}
         </span>
      </template>

      <template #cell-action="{ row }">
         <StSpace align="center" justify="center" gap="0.75rem">
            <StPopover
               :content="row.tid === null ? '自定义图标与说明' : '编辑标签'"
               placement="top">
               <button
                  type="button"
                  :aria-label="row.tid === null ? '自定义内置标签' : '编辑标签'"
                  :class="[actionClass, 'hover:text-secondary']"
                  @click="openEdit(row)">
                  <Plus v-if="row.tid === null" class="text-[1.25rem]" />
                  <Edit v-else class="text-[1.25rem]" />
               </button>
            </StPopover>
            <StPopover
               :content="row.tid === null ? '内置标签不能删除' : row.builtin ? '删除并恢复为内置标签' : '删除标签'"
               placement="top">
               <button
                  type="button"
                  aria-label="删除标签"
                  :disabled="row.tid === null || deletingTid === row.tid"
                  :class="[actionClass, 'hover:text-error']"
                  @click="deleteTag(row)">
                  <Delete class="text-[1.25rem]" />
               </button>
            </StPopover>
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
            <div class="st-font-body-normal">暂无工坊标签</div>
         </StSpace>
      </template>
   </StTable>

   <TagEditingDrawer
      v-model:opened="drawerOpened"
      :tag="editingTag"
      scope="workshop"
      :default-name="defaultName"
      @saved="handleSaved" />
</template>
