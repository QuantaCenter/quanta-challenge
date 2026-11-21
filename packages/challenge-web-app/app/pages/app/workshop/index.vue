<script setup lang="ts">
import { Down, FolderOpen } from '@icon-park/vue-next';
import {
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuPortal,
   DropdownMenuRoot,
   DropdownMenuTrigger,
} from 'reka-ui';
import Divider from '../problems/_components/Divider.vue';
import ProjectSection from './_components/ProjectSection.vue';
import TemplateSection from './_components/TemplateSection.vue';
import TemplateDetailDrawer from './_components/TemplateDetailDrawer.vue';
import GitHubImportDrawer from './_components/GitHubImportDrawer.vue';
import LocalFolderImportDrawer from './_components/LocalFolderImportDrawer.vue';
import { useIsMobile } from '~/composables/use-is-mobile';
import { useWorkshopProjects, type WorkshopTemplateItem } from '~/composables/use-workshop-projects';

useSeoMeta({
   title: '工坊 - Quanta Challenge',
   description:
      '在浏览器中即开即用的前端 / Node.js 开发环境：从 Vue、React、ECharts、D3 等模板创建项目，云端保存，随时继续。',
});

const { $trpc } = useNuxtApp();
const route = useRoute();
const importOpened = ref(route.query.githubImport === '1');
const localImportOpened = ref(false);
const importMenuOpened = ref(false);
const isMobile = useIsMobile();
const importButtonClass = 'shrink-0 whitespace-nowrap gap-2 !border-0 !bg-accent-100 !text-black !px-3 !py-2 !rounded-lg text-sm max-md:gap-1.5 max-md:!px-2.5 max-md:!py-1.5 max-md:text-xs';
const importMenuItemClass = 'flex cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-lg px-3 py-3 outline-none data-[highlighted]:bg-accent-500';

watch(isMobile, (mobile) => {
   if (!mobile) importMenuOpened.value = false;
});

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
               <div class="ml-auto shrink-0">
                  <div class="hidden items-center gap-2 md:flex">
                     <StButton
                        size="sm"
                        aria-label="从本地文件夹导入"
                        :class="importButtonClass"
                        @click="localImportOpened = true">
                        <template #icon>
                           <FolderOpen size="1rem" aria-hidden="true" />
                        </template>
                        <span>从本地文件夹导入</span>
                     </StButton>
                     <StButton
                        size="sm"
                        aria-label="从 GitHub 导入"
                        :class="importButtonClass"
                        @click="importOpened = true">
                        <template #icon>
                           <img src="/icons/github.png" alt="" aria-hidden="true" class="size-4 object-contain" />
                        </template>
                        <span>从 GitHub 导入</span>
                     </StButton>
                  </div>

                  <DropdownMenuRoot v-model:open="importMenuOpened" :modal="false">
                     <DropdownMenuTrigger as-child>
                        <StButton size="sm" class="md:hidden max-md:!pl-3" :class="importButtonClass">
                           <span>导入</span>
                           <Down size="0.875rem" aria-hidden="true" />
                        </StButton>
                     </DropdownMenuTrigger>
                     <DropdownMenuPortal>
                        <DropdownMenuContent
                           align="end"
                           :side-offset="8"
                           :collision-padding="8"
                           class="z-[9998] min-w-36 rounded-xl border border-accent-500 bg-accent-600 p-1 text-sm text-accent-100 shadow-lg md:hidden">
                           <DropdownMenuItem :class="importMenuItemClass" @select="localImportOpened = true">
                              <FolderOpen size="1rem" aria-hidden="true" />
                              <span>从本地</span>
                           </DropdownMenuItem>
                           <DropdownMenuItem :class="importMenuItemClass" @select="importOpened = true">
                              <img src="/icons/github-white.png" alt="" aria-hidden="true" class="size-4 object-contain" />
                              <span>从 GitHub</span>
                           </DropdownMenuItem>
                        </DropdownMenuContent>
                     </DropdownMenuPortal>
                  </DropdownMenuRoot>
               </div>
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
      <LocalFolderImportDrawer
         v-model:opened="localImportOpened"
         :project-count="projects?.length ?? 0"
         @created="refresh()" />
      <GitHubImportDrawer
         v-model:opened="importOpened"
         @created="refresh()" />
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
