<script setup lang="ts">
import { Plus } from '@icon-park/vue-next';
import StatsGrid from '~/components/cloud-function/StatsGrid.vue';
import WorkshopTemplateTable from './_components/WorkshopTemplateTable.vue';
import BuiltinTemplateEditDrawer from './_drawers/BuiltinTemplateEditDrawer.vue';
import {
   customTemplateEditorUrl,
   useWorkshopTemplateAdmin,
   type WorkshopTemplateRow,
} from './_composables/use-workshop-template-admin';

useSeoMeta({ title: '工坊模板管理 - Quanta Challenge' });

const { templates, initialLoading, refresh, busyId, toggle, resetBuiltin, remove } =
   useWorkshopTemplateAdmin();

const stats = computed(() => {
   const list = templates.value ?? [];
   return [
      { label: '模板总数', value: list.length, color: 'text-white' },
      {
         label: '启用中',
         value: list.filter((item) => item.enabled).length,
         color: 'text-success',
      },
      {
         label: '自定义模板',
         value: list.filter((item) => !item.builtin).length,
         color: 'text-secondary',
      },
      {
         label: '绑定快照镜像',
         value: list.filter((item) => item.snapshotImageId).length,
         color: 'text-primary',
      },
   ];
});

const builtinDrawerOpened = ref(false);
const builtinTemplateId = ref<string | null>(null);

const handleEdit = (row: WorkshopTemplateRow) => {
   if (row.builtin) {
      builtinTemplateId.value = row.id;
      builtinDrawerOpened.value = true;
      return;
   }
   navigateTo(customTemplateEditorUrl(row.id));
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="2.5rem"
         class="w-full max-w-[64rem] pb-[10rem] my-6 max-md:my-4 max-md:px-4 max-md:gap-4!">
         <StSpace fill-x justify="between" align="end" gap="1rem">
            <StSpace direction="vertical" gap="0.5rem">
               <h1 class="st-font-hero-bold text-accent-100 max-md:text-[1.5rem] max-md:leading-[1.2]">
                  工坊模板管理
               </h1>
               <p class="st-font-body-normal text-accent-300 max-md:text-sm">
                  停用的模板不再出现在工坊中；配置修改只影响之后打开 / 创建的项目，已有项目的文件不会改变。
               </p>
            </StSpace>
            <StButton
               class="shrink-0 py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem] mb-1"
               @click="navigateTo(customTemplateEditorUrl())">
               <div class="flex gap-2 items-center">
                  <Plus class="text-[1.5rem]" />
                  <span>发布模板</span>
               </div>
            </StButton>
         </StSpace>

         <StatsGrid :items="stats" />

         <WorkshopTemplateTable
            :templates="templates ?? []"
            :loading="initialLoading"
            :busy-id="busyId"
            @toggle="toggle"
            @edit="handleEdit"
            @reset="resetBuiltin"
            @remove="remove" />
      </StSpace>

      <BuiltinTemplateEditDrawer
         v-model:opened="builtinDrawerOpened"
         :template-id="builtinTemplateId"
         @saved="refresh()" />
   </StSpace>
</template>
