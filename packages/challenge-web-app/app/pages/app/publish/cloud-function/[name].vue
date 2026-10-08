<script setup lang="ts">
import { ArrowLeft, Write } from '@icon-park/vue-next';
import FunctionBasicInfoCard from './_components/FunctionBasicInfoCard.vue';
import FunctionCallExampleCard from './_components/FunctionCallExampleCard.vue';
import FunctionVersionTable from './_components/FunctionVersionTable.vue';
import FunctionDangerZone from './_components/FunctionDangerZone.vue';
import SourceEditingDrawer from './_drawers/SourceEditingDrawer.vue';
import { useCloudFunctionDetail } from './_composables/use-cloud-function-detail';

useSeoMeta({ title: '云函数详情 - Quanta Challenge' });

const route = useRoute();
const name = computed(() => String(route.params.name));

const {
   data,
   pending,
   versionRows,
   form,
   sourceDraft,
   editorOpened,
   saving,
   savingVersion,
   publishing,
   activating,
   handleSave,
   handleSaveDraft,
   handlePublish,
   handleActivate,
   handleDelete,
} = useCloudFunctionDetail(name);
</script>

<template>
   <StSpace fill justify="center">
      <StSpace
         direction="vertical"
         gap="2.5rem"
         class="w-[56rem] pb-[10rem] my-6">
         <NuxtLink
            to="/app/publish/cloud-function"
            class="flex w-fit items-center gap-2 text-accent-300 transition-colors hover:text-white">
            <ArrowLeft class="text-[1.125rem]" />
            <span class="st-font-caption">返回云函数列表</span>
         </NuxtLink>

         <!-- Hero -->
         <StSpace justify="between" align="center" class="w-full">
            <h1
               class="font-mono st-font-secondary-bold leading-none text-accent-100">
               {{ name }}
            </h1>
            <StButton
               class="py-[0.5rem] px-[1.375rem] text-accent-100 !rounded-[0.625rem]"
               @click="editorOpened = true">
               <div class="flex gap-2 items-center">
                  <Write class="text-[1.375rem]" />
                  <span>编辑并发布新版本</span>
               </div>
            </StButton>
         </StSpace>

         <FunctionBasicInfoCard
            v-model:form="form"
            :saving="saving"
            @save="handleSave" />

         <FunctionCallExampleCard :name="name" />

         <FunctionVersionTable
            :versions="versionRows"
            :active-version="data?.fn.activeVersion?.version"
            :loading="pending"
            :activating="activating"
            @activate="handleActivate" />

         <FunctionDangerZone @delete="handleDelete" />
      </StSpace>

      <SourceEditingDrawer
         v-model:opened="editorOpened"
         :name="name"
         :source="sourceDraft"
         :submitting="publishing"
         :saving="savingVersion"
         @submit="handlePublish"
         @save="handleSaveDraft" />
   </StSpace>
</template>
