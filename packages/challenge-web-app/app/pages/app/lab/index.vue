<script setup lang="ts">
import Divider from '../problems/_components/Divider.vue';
import ProjectSection from './_components/ProjectSection.vue';
import TemplateSection from './_components/TemplateSection.vue';
import TemplateDetailModal from './_components/TemplateDetailModal.vue';
import { useLabProjects, type LabTemplateItem } from '~/composables/use-lab-projects';

useSeoMeta({
   title: '实验室 - Quanta Challenge',
   description:
      '在浏览器中即开即用的前端 / Node.js 开发环境：从 Vue、React、ECharts、D3 等模板创建项目，云端保存，随时继续。',
});

const { $trpc } = useNuxtApp();

const {
   projects,
   pending,
   error,
   refresh,
   ready,
   renameProject,
   deleteProject,
} = useLabProjects();

const templatesAsync = useAsyncData('lab-templates', () =>
   $trpc.protected.lab.templates.query(),
);
const {
   data: templates,
   pending: templatesPending,
   error: templatesError,
   refresh: refreshTemplates,
} = templatesAsync;

// 模板分类：分类页签与卡片分类标签；加载失败时卡片显示「未分类」，不阻塞模板列表
const categoriesAsync = useAsyncData('lab-categories', () =>
   $trpc.protected.lab.categories.query(),
);
const { data: categories, refresh: refreshCategories } = categoriesAsync;

await Promise.all([ready, templatesAsync, categoriesAsync]);

const retryTemplates = () => Promise.all([refreshTemplates(), refreshCategories()]);

const modalOpened = ref(false);
const activeTemplate = ref<LabTemplateItem | null>(null);
const openTemplate = (template: LabTemplateItem) => {
   activeTemplate.value = template;
   modalOpened.value = true;
};
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      align="center"
      gap="0"
      class="hide-scrollbar overflow-auto max-md:overflow-x-hidden">
      <StSpace
         fill-y
         direction="vertical"
         class="mt-6 w-full max-w-[65rem] max-md:px-4">
         <h1
            class="text-[2.5rem] font-bold text-white max-md:text-[1.5rem] max-md:leading-[1.2]">
            实验室
         </h1>

         <ProjectSection
            :projects="projects"
            :pending="pending"
            :error="error"
            @retry="refresh()"
            @rename="renameProject"
            @delete="deleteProject" />

         <Divider />

         <TemplateSection
            :templates="templates ?? []"
            :categories="categories ?? []"
            :pending="templatesPending && !templates"
            :error="!!templatesError"
            @retry="retryTemplates()"
            @select="openTemplate" />
         <StSpacer fill flex no-shrink height="1rem" />
      </StSpace>

      <TemplateDetailModal
         v-model:opened="modalOpened"
         :template="activeTemplate"
         :categories="categories ?? []"
         :project-count="projects?.length ?? 0"
         @created="refresh()" />
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
