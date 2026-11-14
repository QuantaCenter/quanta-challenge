<script setup lang="ts">
import Divider from '../problems/_components/Divider.vue';
import ProjectSection from './_components/ProjectSection.vue';
import TemplateSection from './_components/TemplateSection.vue';
import TemplateDetailDrawer from './_components/TemplateDetailDrawer.vue';
import GitHubImportDrawer from './_components/GitHubImportDrawer.vue';
import { useWorkshopProjects, type WorkshopTemplateItem } from '~/composables/use-workshop-projects';

useSeoMeta({
   title: '工坊 - Quanta Challenge',
   description:
      '在浏览器中即开即用的前端 / Node.js 开发环境：从 Vue、React、ECharts、D3 等模板创建项目，云端保存，随时继续。',
});

const { $trpc } = useNuxtApp();
const route = useRoute();
const importOpened = ref(route.query.githubImport === '1');

const {
   projects,
   pending,
   error,
   refresh,
   ready,
   renameProject,
   deleteProject,
} = useWorkshopProjects();

const templatesAsync = useAsyncData('workshop-templates', () =>
   $trpc.protected.workshop.templates.query(),
);
const {
   data: templates,
   pending: templatesPending,
   error: templatesError,
   refresh: refreshTemplates,
} = templatesAsync;

// 模板分类：分类页签与卡片分类标签；加载失败时卡片显示「未分类」，不阻塞模板列表
const categoriesAsync = useAsyncData('workshop-categories', () =>
   $trpc.protected.workshop.categories.query(),
);
const { data: categories, refresh: refreshCategories } = categoriesAsync;

await Promise.all([ready, templatesAsync, categoriesAsync]);

const retryTemplates = () => Promise.all([refreshTemplates(), refreshCategories()]);

const templateOpened = ref(false);
const activeTemplate = ref<WorkshopTemplateItem | null>(null);
const openTemplate = (template: WorkshopTemplateItem) => {
   activeTemplate.value = template;
   templateOpened.value = true;
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
            工坊
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
            @select="openTemplate">
            <template #header-actions>
               <StButton
                  size="sm"
                  aria-label="从 GitHub 导入"
                  class="shrink-0 whitespace-nowrap gap-2 !border-0 !bg-accent-100 !text-black !px-3 !py-2 !rounded-lg text-sm max-md:gap-1.5 max-md:!px-2.5 max-md:!py-1.5 max-md:text-xs"
                  @click="importOpened = true">
                  <template #icon>
                     <img src="/icons/github.png" alt="" aria-hidden="true" class="size-4 object-contain" />
                  </template>
                  <span><span class="max-md:hidden">从 </span>GitHub 导入</span>
               </StButton>
            </template>
         </TemplateSection>
         <StSpacer fill flex no-shrink height="1rem" />
      </StSpace>

      <TemplateDetailDrawer
         v-model:opened="templateOpened"
         :template="activeTemplate"
         :categories="categories ?? []"
         :project-count="projects?.length ?? 0"
         @created="refresh()" />
      <GitHubImportDrawer
         v-model:opened="importOpened"
         @created="refresh()" />
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
