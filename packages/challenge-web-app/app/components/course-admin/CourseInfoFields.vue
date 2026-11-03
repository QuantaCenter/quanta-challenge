<script setup lang="ts">
import { BookOpen } from '@icon-park/vue-next';
import MarkdownEditingDrawer from '~/pages/app/publish/_drawers/MarkdownEditingDrawer.vue';
import type { ICourseInfoForm } from '~/types/course-admin';

/**
 * 课程基本信息字段（标题 / 简介 / 导读 / 封面），需放在 StForm 内使用。
 * 新建页与编辑页共用，保证两处校验与交互一致。
 */
const formdata = defineModel<ICourseInfoForm>('formdata', { required: true });

withDefaults(
   defineProps<{
      outerClass?: string;
   }>(),
   { outerClass: 'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary' },
);

/** Monaco 较重，首次打开时才挂载 Markdown 编辑抽屉 */
const markdownMounted = ref(false);
const markdownOpened = ref(false);
const openMarkdownEditor = async () => {
   markdownMounted.value = true;
   await nextTick();
   markdownOpened.value = true;
};
</script>

<template>
   <StFormItem name="title" label="课程标题" required>
      <template #header-right>
         <span class="st-font-caption text-accent-400">
            {{ formdata.title.length }} / 50
         </span>
      </template>
      <StInput
         v-model:value="formdata.title"
         placeholder="例如：从零开始的 Vue 3 组件开发"
         maxlength="50"
         :outer-class />
   </StFormItem>

   <StFormItem name="summary" label="一句话简介">
      <template #header-right>
         <span class="st-font-caption text-accent-400">
            {{ formdata.summary.length }} / 120
         </span>
      </template>
      <StTextarea
         v-model:value="formdata.summary"
         rows="2"
         maxlength="120"
         placeholder="展示在课程卡片上，概括学完能获得什么"
         :outer-class />
   </StFormItem>

   <StFormItem name="description" label="课程导读">
      <template #header-right>
         <StTextButton text="使用 md 编辑器" @click="openMarkdownEditor" />
      </template>
      <StTextarea
         v-model:value="formdata.description"
         rows="5"
         placeholder="支持 Markdown，展示在课程详情页的「导读」中"
         :outer-class />
   </StFormItem>

   <StFormItem name="coverImageId" label="课程封面">
      <StUploadImage
         v-model:image-id="formdata.coverImageId"
         v-model:image-url="formdata.coverImageUrl"
         :icon="BookOpen"
         image-max-height="12rem"
         placeholder="上传课程封面，建议使用正方形图片" />
   </StFormItem>

   <MarkdownEditingDrawer
      v-if="markdownMounted"
      v-model:opened="markdownOpened"
      v-model:markdown="formdata.description"
      drawer-title="编辑课程导读" />
</template>
