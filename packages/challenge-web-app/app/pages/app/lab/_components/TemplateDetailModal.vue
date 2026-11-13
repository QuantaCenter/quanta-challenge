<script setup lang="ts">
import type { DefineComponent } from 'vue';
import { BookOpen, Close, Folder, LoadingFour, Plus, TreeList } from '@icon-park/vue-next';
import type { LabTemplateItem } from '~/composables/use-lab-projects';
import {
   resolveLabCategory,
   type LabCategoryDisplay,
} from '~/utils/lab-category-icons';
import { buildFileSystemTree } from '~/utils/fs-tree';
import { formatFileSize } from '~/utils/format-file-size';
import { useMarkdown } from '~/composables/use-markdown';
import { useMessage } from '~/components/st/Message/use-message';
import TemplateFilePreview from './TemplateFilePreview.vue';
import TechTagIcon from './TechTagIcon.vue';

/** 模板详情：介绍（README）+ 模板结构（文件树与代码预览），底部填写项目名后从该模板创建项目 */

const props = defineProps<{
   template: LabTemplateItem | null;
   /** 全部模板分类，用于展示分类标签 */
   categories: LabCategoryDisplay[];
   /** 已创建的项目数量（用于提示配额） */
   projectCount: number;
}>();

const category = computed(() =>
   resolveLabCategory(props.categories, props.template?.category ?? ''),
);

const opened = defineModel<boolean>('opened', { default: false });

const limits = useRuntimeConfig().public.lab;
const message = useMessage();
const { $trpc } = useNuxtApp();

type Tab = 'readme' | 'structure';
const tab = ref<Tab>('readme');
const tabOptions = [
   { label: '介绍', value: 'readme', icon: BookOpen as DefineComponent },
   { label: '模板结构', value: 'structure', icon: TreeList as DefineComponent },
];

const { html, update } = useMarkdown();

// 模板文件不随列表下发，打开弹窗时按需加载并缓存（同一页面内重复打开不再请求）
const filesCache = new Map<string, Record<string, string>>();
/** 当前模板的文件；为 null 时表示加载中或加载失败（见 filesError） */
const templateFiles = ref<Record<string, string> | null>(null);
const filesError = ref('');
const loadFiles = async (id: string) => {
   filesError.value = '';
   const cached = filesCache.get(id);
   if (cached) {
      templateFiles.value = cached;
      return;
   }
   templateFiles.value = null;
   try {
      const result = await $trpc.protected.lab.templateFiles.query({ id });
      filesCache.set(id, result);
      if (props.template?.id === id) templateFiles.value = result;
   } catch (error: any) {
      if (props.template?.id === id) {
         filesError.value = error?.message ?? '模板文件加载失败';
      }
   }
};

const files = computed(() =>
   Object.entries(templateFiles.value ?? {}).map(([path, content]) => ({
      path: `/project/${path}`,
      relative: path,
      content,
      size: new TextEncoder().encode(content).length,
   })),
);
const totalSize = computed(() =>
   files.value.reduce((sum, file) => sum + file.size, 0),
);
const tree = computed(
   () =>
      buildFileSystemTree(
         Object.fromEntries(files.value.map((file) => [file.path, file.content])),
      ).rootNodes,
);
const selectedPath = ref('');
const selectedFile = computed(() =>
   files.value.find((file) => file.path === selectedPath.value),
);

// 「模板结构」首次需要初始化 Shiki 并高亮入口文件（同步，实测 Vue 语法首次高亮约 400ms，会卡住主线程）。
// 这里等介绍已经渲染出来、并再停留一小会儿之后才预挂载，避免和介绍的渲染抢主线程。
const STRUCTURE_WARMUP_DELAY = 800;
const structureMounted = ref(false);
watch(
   () => [opened.value, tab.value] as const,
   ([isOpened, currentTab], _old, onCleanup) => {
      if (!import.meta.client || structureMounted.value || !isOpened) return;
      if (currentTab === 'structure') {
         structureMounted.value = true;
         return;
      }
      const timer = setTimeout(() => {
         structureMounted.value = true;
      }, STRUCTURE_WARMUP_DELAY);
      onCleanup(() => clearTimeout(timer));
   },
   { immediate: true },
);

// 介绍用的是懒加载组件，首次展示要先拉取 chunk 才能渲染；页面挂载后提前加载，打开弹窗时就能立刻显示
onMounted(() => {
   void preloadComponents('StMarkdownPreview');
});

const projectName = ref('');
const nameError = computed(() => {
   const name = projectName.value.trim();
   if (!name) return '请输入项目名称';
   if (name.length > 40) return '项目名称最多 40 个字符';
   return '';
});
const quotaReached = computed(
   () => props.projectCount >= limits.maxProjectsPerUser,
);

watch(
   () => [props.template, opened.value] as const,
   ([template, isOpened]) => {
      if (!template || !isOpened) return;
      tab.value = 'readme';
      update(template.readme);
      selectedPath.value = `/project/${template.entry}`;
      projectName.value = `我的 ${template.name} 项目`;
      creating.value = false;
      void loadFiles(template.id);
   },
   { immediate: true },
);

const emit = defineEmits<{ created: [id: string] }>();

const creating = ref(false);
const create = async () => {
   if (!props.template || nameError.value || quotaReached.value || creating.value) {
      return;
   }
   creating.value = true;
   try {
      const { id } = await $trpc.protected.lab.create.mutate({
         templateId: props.template.id,
         name: projectName.value.trim(),
      });
      const url = `/lab/${id}`;
      // IDE 页面跨源隔离（COOP/COEP），必须整页加载。
      // 创建完成后再打开新标签页；若被浏览器拦截（如 Safari 对异步弹窗更严格），退回到当前页跳转，避免用户看不到结果
      const newTab = window.open(url, '_blank');
      if (!newTab) window.location.assign(url);
      emit('created', id);
      opened.value = false;
   } catch (error: any) {
      message.error('创建项目失败', error?.message ?? String(error));
   } finally {
      creating.value = false;
   }
};

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
   if (opened.value && event.key === 'Escape') opened.value = false;
});

// 弹窗打开期间锁定页面滚动，避免滚轮 / 触摸滚动穿透到背景
const documentScrollLocked = useScrollLock(
   import.meta.client ? document.documentElement : null,
);
const bodyScrollLocked = useScrollLock(import.meta.client ? document.body : null);
watch(
   opened,
   (value) => {
      documentScrollLocked.value = value;
      bodyScrollLocked.value = value;
   },
   { immediate: true },
);
onUnmounted(() => {
   documentScrollLocked.value = false;
   bodyScrollLocked.value = false;
});
</script>

<template>
   <StModal v-model:opened="opened" close-on-mask>
      <!--
         外层用固定高度而不是 max-height：flex 列容器高度不确定时，子元素的 h-full 会退化成 auto，
         内容区撑开后被 overflow-hidden 裁掉、无法滚动，滚轮事件转而滚动了背景页面。
      -->
      <div
         v-if="template"
         role="dialog"
         aria-modal="true"
         :aria-label="`${template.name} 模板详情`"
         class="relative w-[min(60rem,calc(100vw-2rem))] h-[min(46rem,calc(100dvh-2rem))] flex flex-col rounded-2xl border border-accent-500 bg-accent-600 text-accent-100 shadow-2xl shadow-background overflow-hidden overscroll-contain">
         <!-- 头部 -->
         <div class="relative shrink-0 px-6 pt-6 pb-4 max-md:px-4 max-md:pt-4">
            <StButton
               size="sm"
               aria-label="关闭"
               class="!absolute right-3 top-3 z-10 !size-10 !flex !items-center !justify-center !bg-transparent !p-0 !text-accent-300 hover:!bg-accent-500 hover:!text-white max-md:right-2 max-md:top-2"
               @click="opened = false">
               <Close size="1.25rem" />
            </StButton>
            <StSpace align="center" gap="1rem" class="relative pr-10">
               <StSpace
                  center
                  no-shrink
                  class="size-16 rounded-xl bg-accent-500 max-md:size-12">
                  <img
                     :src="template.icon"
                     :alt="template.name"
                     class="size-9 object-contain max-md:size-7"
                     draggable="false" />
               </StSpace>
               <StSpace direction="vertical" gap="0.375rem" class="min-w-0">
                  <StSpace align="center" gap="0.5rem" wrap>
                     <h2 class="text-xl font-bold text-white max-md:text-lg">
                        {{ template.name }}
                     </h2>
                     <StTag
                        size="small"
                        contrast-text
                        :color="category.color"
                        :content="category.name" />
                  </StSpace>
                  <p class="st-font-caption text-accent-300 leading-5">
                     {{ template.description }}
                  </p>
                  <StSpace align="center" gap="0.75rem" wrap class="st-font-caption text-accent-300">
                     <StSpace
                        v-for="tagName in template.tags"
                        :key="tagName"
                        align="center"
                        gap="0.375rem">
                        <TechTagIcon :name="tagName" :icon="template.tagIcons?.[tagName]" />
                        <span>{{ tagName }}</span>
                     </StSpace>
                  </StSpace>
               </StSpace>
            </StSpace>
         </div>

         <div class="shrink-0 px-6 max-md:px-4">
            <StTabs v-model="tab" :options="tabOptions" />
         </div>

         <!-- 内容 -->
         <!-- 两个页签都用 v-show 保持挂载：切换时不再重建 Markdown / 文件树 / Shiki 高亮器 -->
         <div class="flex-1 min-h-0 overflow-hidden">
            <div
               v-show="tab === 'readme'"
               class="h-full overflow-y-auto overscroll-contain mini-scrollbar px-6 py-5 text-sm max-md:px-4">
               <LazyStMarkdownPreview :html="html" class="w-full" />
            </div>

            <div
               v-if="structureMounted && !templateFiles"
               v-show="tab === 'structure'"
               class="h-full flex flex-col items-center justify-center gap-3 text-sm text-accent-300">
               <template v-if="filesError">
                  <span>{{ filesError }}</span>
                  <StButton bordered size="sm" @click="template && loadFiles(template.id)">
                     重试
                  </StButton>
               </template>
               <StSpace v-else align="center" gap="0.5rem">
                  <LoadingFour class="animate-spin" />
                  <span>正在加载模板文件...</span>
               </StSpace>
            </div>
            <div
               v-else-if="structureMounted"
               v-show="tab === 'structure'"
               class="h-full flex gap-3 p-4 max-md:flex-col max-md:p-3">
               <div
                  class="w-[15rem] shrink-0 flex flex-col rounded-xl bg-[#1F1F1F] p-2 max-md:w-full max-md:h-40">
                  <StSpace
                     align="center"
                     gap="0.375rem"
                     class="px-2 pt-1 pb-2 text-xs text-accent-400">
                     <Folder />
                     <span>{{ files.length }} 个文件 · {{ formatFileSize(totalSize) }}</span>
                  </StSpace>
                  <div class="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain mini-scrollbar">
                     <StFileSystemTree
                        class="absolute top-0 left-0"
                        :directory="tree"
                        :current-file-path="selectedPath"
                        :default-opened="true"
                        @file-or-folder-click="(item) => item.type === 'file' && (selectedPath = item.path)" />
                  </div>
               </div>
               <div class="flex-1 min-w-0 min-h-0 flex flex-col rounded-xl bg-[#1F1F1F] overflow-hidden">
                  <StSpace
                     fill-x
                     align="center"
                     justify="between"
                     gap="0.5rem"
                     class="px-4 h-10 shrink-0 border-b border-accent-600 text-xs text-accent-300">
                     <span class="truncate font-family-fira-code">
                        {{ selectedFile?.relative ?? (files.length ? '选择左侧文件以预览' : '空白项目不含任何文件') }}
                     </span>
                     <span v-if="selectedFile" class="shrink-0 text-accent-400">
                        {{ formatFileSize(selectedFile.size) }}
                        <template v-if="selectedFile.relative === template.entry"> · 入口文件</template>
                     </span>
                  </StSpace>
                  <div class="flex-1 min-h-0 overflow-auto overscroll-contain mini-scrollbar">
                     <TemplateFilePreview
                        v-if="selectedFile"
                        :path="selectedFile.path"
                        :code="selectedFile.content" />
                  </div>
               </div>
            </div>
         </div>

         <!-- 底部：创建项目 -->
         <StSpace
            fill-x
            align="center"
            gap="0.75rem"
            class="shrink-0 px-6 py-4 border-t border-accent-500 max-md:px-4">
            <StInput
               v-model:value="projectName"
               aria-label="项目名称"
               placeholder="项目名称"
               maxlength="40"
               :disabled="creating"
               :status="projectName && nameError ? 'error' : undefined"
               outer-class="flex-1 min-w-0 !h-11 !py-0 !px-3 bg-accent-500 border border-accent-400 [&_input]:min-w-0 [&_input]:w-full"
               @keydown.enter="create" />
            <StButton
               theme="primary"
               :loading="creating"
               :disabled="!!nameError || quotaReached"
               :title="quotaReached ? `已达到 ${limits.maxProjectsPerUser} 个项目的上限，请先删除不再需要的项目` : undefined"
               class="shrink-0 !h-11 !py-0 !px-5"
               @click="create">
               <template #icon="{ loading }">
                  <LoadingFour v-if="loading" class="mr-2 animate-spin" />
                  <Plus v-else class="mr-2" />
               </template>
               {{ quotaReached ? '项目数已达上限' : '创建项目' }}
            </StButton>
         </StSpace>
      </div>
   </StModal>
</template>

<style scoped src="@/assets/css/utils.css" />
