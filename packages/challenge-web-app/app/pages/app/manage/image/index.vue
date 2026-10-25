<script setup lang="ts">
import { Plus } from '@icon-park/vue-next';
import StatsGrid from '~/components/cloud-function/StatsGrid.vue';
import ImageBuildTable from './_components/ImageBuildTable.vue';
import ImageBuildDetailDrawer from './_drawers/ImageBuildDetailDrawer.vue';
import {
   openImageBuildEditor,
   useImageBuildAdmin,
   type ImageBuildRow,
} from './_composables/use-image-build-admin';

useSeoMeta({ title: '快照镜像管理 - Quanta Challenge' });

const { builds, initialLoading, removingId, removeBuild } = useImageBuildAdmin();

const stats = computed(() => {
   const list = builds.value ?? [];
   const totalCompressed = list.reduce(
      (sum, item) => sum + (item.compressedSizeBytes ?? 0),
      0,
   );
   return [
      { label: '快照镜像总数', value: list.length, color: 'text-white' },
      {
         label: '可用',
         value: list.filter((item) => item.status === 'ready').length,
         color: 'text-success',
      },
      {
         label: '被题目使用',
         value: list.filter((item) => item.referenceCount > 0).length,
         color: 'text-primary',
      },
      {
         label: '占用存储',
         value: `${(totalCompressed / 1024 / 1024).toFixed(1)} MB`,
         color: 'text-accent-100',
      },
   ];
});

const detailOpened = ref(false);
const detailId = ref<string | null>(null);

const handleView = (row: ImageBuildRow) => {
   detailId.value = row.id;
   detailOpened.value = true;
};

const handleRemove = async (id: string, name: string) => {
   const removed = await removeBuild(id, name);
   if (removed && detailId.value === id) detailOpened.value = false;
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace direction="vertical" gap="2.5rem" class="w-full max-w-[64rem] pb-[10rem] my-6 max-md:my-4 max-md:px-4 max-md:gap-4!">
         <StSpace fill-x justify="between" align="end">
            <h1 class="st-font-hero-bold text-accent-100 max-md:text-[1.5rem] max-md:leading-[1.2]">快照镜像管理</h1>
            <StButton
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem] mb-1"
               @click="openImageBuildEditor()">
               <div class="flex gap-2 items-center">
                  <Plus class="text-[1.5rem]" />
                  <span>新建快照镜像</span>
               </div>
            </StButton>
         </StSpace>

         <StatsGrid :items="stats" />

         <ImageBuildTable
            :builds="builds ?? []"
            :loading="initialLoading"
            :removing-id="removingId"
            @view="handleView"
            @edit="(row) => openImageBuildEditor(row.id)"
            @remove="(row) => handleRemove(row.id, row.name)" />
      </StSpace>

      <ImageBuildDetailDrawer
         v-model:opened="detailOpened"
         :image-id="detailId"
         @edit="openImageBuildEditor"
         @remove="handleRemove" />
   </StSpace>
</template>
