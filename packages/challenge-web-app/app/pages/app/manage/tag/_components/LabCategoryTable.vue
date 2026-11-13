<script setup lang="ts">
import type { DefineComponent } from 'vue';
import { Delete, Down, Edit, ThreeHexagons, Up } from '@icon-park/vue-next';
import { dialog } from '~/composables/use-dialog';
import { useMessage } from '~/components/st/Message/use-message';
import type { ITableColumn } from '~/components/st/Table/type';
import { logger } from '~~/lib/logger';
import { labCategoryIcon } from '~/utils/lab-category-icons';
import LabCategoryEditingDrawer, {
   type ILabCategoryEditingTarget,
} from '~/components/tag/LabCategoryEditingDrawer.vue';

/**
 * 模板分类管理：排序、启用 / 停用、编辑与删除。
 * 内置分类不能删除；仍有模板使用的分类也不能删除（需先把模板改到其他分类）。
 */

const { $trpc } = useNuxtApp();
const message = useMessage();

const {
   data: categories,
   pending,
   error,
   refresh,
} = useAsyncData('manage-lab-categories', () => $trpc.admin.labCategory.list.query());

watch(
   error,
   (newError) => {
      if (newError) {
         logger.error(newError, '加载模板分类失败');
         message.error('模板分类加载失败', '请检查网络连接或稍后重试');
      }
   },
   { immediate: true },
);

type CategoryRow = NonNullable<typeof categories.value>[number];

const emits = defineEmits<{ count: [count: number] }>();
watch(
   () => categories.value?.length,
   (count) => count !== undefined && emits('count', count),
   { immediate: true },
);

const columns: ITableColumn[] = [
   { key: 'order', title: '排序', width: '4.5rem', align: 'center', skeletonClass: 'h-5 w-[2rem] rounded-md mx-auto' },
   { key: 'label', title: '分类' },
   {
      key: 'templates',
      title: '模板数',
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
   { key: 'action', title: '操作', width: '7rem', align: 'center' },
];

const busyId = ref<string | null>(null);
const runExclusive = async (id: string, task: () => Promise<void>) => {
   if (busyId.value) return;
   busyId.value = id;
   try {
      await task();
   } catch (err) {
      message.error('操作失败', (err as Error)?.message || '请稍后重试');
   } finally {
      busyId.value = null;
   }
};

const move = (row: CategoryRow, offset: -1 | 1) =>
   runExclusive(row.id, async () => {
      const ids = (categories.value ?? []).map((item) => item.id);
      const index = ids.indexOf(row.id);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target]!, ids[index]!];
      await $trpc.admin.labCategory.reorder.mutate({ ids });
      await refresh();
   });

const toggle = (row: CategoryRow, enabled: boolean) =>
   runExclusive(row.id, async () => {
      await $trpc.admin.labCategory.setEnabled.mutate({ id: row.id, enabled });
      await refresh();
      message.success(
         enabled ? '分类已启用' : '分类已停用',
         enabled ? undefined : '该分类不再显示为筛选页签，已归入的模板照常展示',
      );
   });

const remove = async (row: CategoryRow) => {
   if (row.builtin || row.templateCount > 0 || busyId.value) return;
   const confirmed = await dialog.confirm({
      title: `删除模板分类「${row.name}」？`,
      description: '此操作不可撤销。',
      variant: 'danger',
      confirmText: '删除',
      cancelText: '取消',
   });
   if (!confirmed) return;
   await runExclusive(row.id, async () => {
      await $trpc.admin.labCategory.remove.mutate({ id: row.id });
      await refresh();
      message.success('分类已删除');
   });
};

const drawerOpened = ref(false);
const editing = ref<ILabCategoryEditingTarget | null>(null);
const openCreate = () => {
   editing.value = null;
   drawerOpened.value = true;
};
const openEdit = (row: CategoryRow) => {
   editing.value = row;
   drawerOpened.value = true;
};
const handleSaved = async () => {
   await refresh();
   message.success('保存成功');
};

defineExpose({ openCreate });

const removeHint = (row: CategoryRow) =>
   row.builtin
      ? '内置分类不能删除，可以停用'
      : row.templateCount
        ? `仍有 ${row.templateCount} 个模板属于该分类`
        : '删除分类';

const actionClass =
   'flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';
const moveClass =
   'flex items-center justify-center size-6 rounded text-accent-300 hover:bg-accent-500 hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent';
</script>

<template>
   <StTable
      :columns="columns"
      :rows="categories ?? []"
      :loading="pending && !categories"
      row-key="id"
      :skeleton-count="4">
      <template #cell-order="{ row, index }">
         <StSpace direction="vertical" align="center" gap="0">
            <button
               type="button"
               aria-label="上移"
               :disabled="index === 0 || !!busyId"
               :class="moveClass"
               @click="move(row, -1)">
               <Up />
            </button>
            <button
               type="button"
               aria-label="下移"
               :disabled="index === (categories?.length ?? 0) - 1 || !!busyId"
               :class="moveClass"
               @click="move(row, 1)">
               <Down />
            </button>
         </StSpace>
      </template>

      <template #cell-label="{ row }">
         <StSpace align="center" gap="0.75rem" class="min-w-0">
            <StSpace
               center
               no-shrink
               class="size-9 rounded-lg"
               :style="{ backgroundColor: `${row.color}26`, color: row.color }">
               <Component :is="labCategoryIcon(row.icon) as DefineComponent" size="1.125rem" />
            </StSpace>
            <StSpace direction="vertical" gap="0.125rem" class="min-w-0">
               <StSpace align="center" gap="0.5rem" class="min-w-0">
                  <StTag size="small" contrast-text :color="row.color" :content="row.name" class="shrink-0" />
                  <span
                     v-if="row.builtin"
                     class="shrink-0 rounded-md bg-accent-500 px-1.5 py-0.5 text-[0.6875rem] text-accent-200">
                     内置
                  </span>
               </StSpace>
               <span class="truncate st-font-caption text-accent-300">
                  {{ row.description || '暂无描述' }}
               </span>
               <span class="truncate font-mono text-[0.6875rem] text-accent-400">{{ row.id }}</span>
            </StSpace>
         </StSpace>
      </template>

      <template #cell-templates="{ row }">
         <span class="st-font-body-normal" :class="row.templateCount ? 'text-white' : 'text-accent-400'">
            {{ row.templateCount }}
         </span>
      </template>

      <template #cell-status="{ row }">
         <StPopover :content="row.enabled ? '点击停用' : '点击启用'" placement="top">
            <div class="flex justify-center" :class="{ 'pointer-events-none opacity-60': busyId === row.id }">
               <StSwitch
                  :model-value="row.enabled"
                  @update:model-value="(value: boolean) => toggle(row, value)" />
            </div>
         </StPopover>
      </template>

      <template #cell-action="{ row }">
         <StSpace align="center" justify="center" gap="0.75rem">
            <StPopover content="编辑分类" placement="top">
               <button
                  type="button"
                  aria-label="编辑分类"
                  :class="[actionClass, 'hover:text-secondary']"
                  @click="openEdit(row)">
                  <Edit class="text-[1.25rem]" />
               </button>
            </StPopover>
            <StPopover :content="removeHint(row)" placement="top">
               <button
                  type="button"
                  aria-label="删除分类"
                  :disabled="row.builtin || row.templateCount > 0 || busyId === row.id"
                  :class="[actionClass, 'hover:text-error']"
                  @click="remove(row)">
                  <Delete class="text-[1.25rem]" />
               </button>
            </StPopover>
         </StSpace>
      </template>

      <template #skeleton-label="{ itemClass }">
         <StSpace align="center" gap="0.75rem">
            <StSkeletonItem class="size-9 rounded-lg" :class="itemClass" />
            <StSpace direction="vertical" gap="0.5rem">
               <StSkeletonItem class="h-5 w-[6rem] rounded-md" :class="itemClass" />
               <StSkeletonItem class="h-4 w-[12rem] rounded-md" :class="itemClass" />
            </StSpace>
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
            <ThreeHexagons size="2.625rem" />
            <div class="st-font-body-normal">暂无模板分类</div>
         </StSpace>
      </template>
   </StTable>

   <LabCategoryEditingDrawer
      v-model:opened="drawerOpened"
      :category="editing"
      @saved="handleSaved" />
</template>
