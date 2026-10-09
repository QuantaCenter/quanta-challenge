<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue';
import { SaveOne, TableReport } from '@icon-park/vue-next';
import { useMarkdown } from '~/composables/use-markdown';

const DIFFICULTY_LABEL: Record<string, string> = {
   easy: '简单',
   medium: '中等',
   hard: '困难',
   very_hard: '极难',
};

const DIFFICULTY_COLOR: Record<string, string> = {
   easy: '#14e87e',
   medium: '#ffbe31',
   hard: '#fa2f32',
   very_hard: '#fa2f32',
};

interface EditableProblem {
   baseId: number;
   title: string;
   difficulty?: string;
   totalScore?: number;
}

const props = defineProps<{
   articleIndex: number;
   article: {
      title: string;
      markdown?: string;
      problems: EditableProblem[];
   };
}>();

const emit = defineEmits<{
   save: [markdown: string];
}>();

const opened = defineModel<boolean>('opened', { default: false });

const { containerKey, update } = useMarkdown();
const markdownContainer = useTemplateRef<HTMLElement>(containerKey);

const draft = ref('');
const bodyInput = useTemplateRef<ComponentPublicInstance>('bodyInput');
const pickerOpened = ref(false);

const escapeHtml = (text: string) =>
   text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const problemOf = (baseId: number) =>
   props.article.problems.find((item) => item.baseId === baseId);

const problemCardOf = (baseId: number) => {
   const problem = problemOf(baseId);
   if (!problem) {
      return '<div class="my-4 p-4 rounded-[0.75rem] border border-dashed border-accent-500 text-accent-400 st-font-caption">该题目已不在这篇文章的引用列表中</div>';
   }

   const difficulty = problem.difficulty ?? 'medium';
   const label = DIFFICULTY_LABEL[difficulty] ?? '中等';
   const color = DIFFICULTY_COLOR[difficulty] ?? '#ffbe31';
   const tagText =
      label === '简单' || label === '中等' ? 'text-accent-700' : 'text-white';

   return [
      '<div class="my-4 p-4 rounded-[0.75rem] bg-accent-500/40 flex items-center gap-3">',
      '<div class="shrink-0 size-[1.125rem] rounded-full border-2 border-accent-400"></div>',
      '<div class="min-w-0 flex-1 flex flex-col gap-[0.25rem]">',
      `<span class="st-font-caption truncate text-accent-100">${escapeHtml(problem.title)}</span>`,
      '<div class="flex flex-nowrap items-center gap-[0.5rem]">',
      `<span class="px-[0.5rem] py-[0.25rem] rounded-[0.375rem] text-[0.625rem] ${tagText}" style="background-color:${color}">${label}</span>`,
      `<span class="st-font-tooltip text-accent-400 font-family-manrope">${problem.totalScore ?? 0} 分</span>`,
      '</div>',
      '</div>',
      '<span class="shrink-0 px-[0.75rem] py-[0.375rem] rounded-[0.375rem] border border-accent-400 text-accent-300 st-font-tooltip">已引用</span>',
      '</div>',
   ].join('');
};

const renderPreview = async () => {
   await update(draft.value);
   await nextTick();
   const container = markdownContainer.value;
   if (!container) return;
   container.innerHTML = container.innerHTML.replace(
      /\[\[problem:(\d+)\]\]/g,
      (_, id: string) => problemCardOf(Number(id)),
   );
};

// StTextarea 的模板 ref 拿到的是组件实例，不能直接当 DOM 用
const bodyTextarea = () => {
   const root = bodyInput.value?.$el as HTMLElement | undefined;
   return root?.querySelector('textarea') ?? null;
};

const insertProblem = (baseId: number) => {
   const el = bodyTextarea();
   const token = `[[problem:${baseId}]]`;
   const start = el?.selectionStart ?? draft.value.length;
   const end = el?.selectionEnd ?? start;

   draft.value = `${draft.value.slice(0, start)}${token}${draft.value.slice(
      end,
   )}`;
   pickerOpened.value = false;

   nextTick(() => {
      if (!el) return;
      const caret = start + token.length;
      el.focus();
      el.setSelectionRange(caret, caret);
   });
};

const draftProblemCount = (baseId: number) =>
   draft.value.split(`[[problem:${baseId}]]`).length - 1;

const save = () => {
   emit('save', draft.value);
   opened.value = false;
};

const cancel = () => {
   opened.value = false;
   pickerOpened.value = false;
};

const onDocumentClick = (event: MouseEvent) => {
   const target = event.target as HTMLElement | null;
   if (!target?.closest('[data-problem-picker]')) pickerOpened.value = false;
};

watch(opened, (value) => {
   if (!value) return;
   draft.value = props.article.markdown ?? '';
   pickerOpened.value = false;
});

watch(draft, () => {
   renderPreview();
});

watch(pickerOpened, (value) => {
   if (value) document.addEventListener('click', onDocumentClick);
   else document.removeEventListener('click', onDocumentClick);
});

onMounted(() => {
   draft.value = props.article.markdown ?? '';
   renderPreview();
});

onUnmounted(() => {
   document.removeEventListener('click', onDocumentClick);
});
</script>

<template>
   <StDrawer global v-model:opened="opened" width="66rem">
      <StSpace direction="vertical" gap="1rem" class="text-white h-full">
         <StSpace direction="vertical" gap="1.5rem" class="p-6 w-full h-full">
            <StSpace align="center" gap="1rem" fill-x no-shrink>
               <div class="flex flex-col gap-[0.25rem] min-w-0">
                  <h1 class="st-font-secondary-bold">编辑文章</h1>
                  <span class="st-font-caption text-accent-300 truncate">
                     第 {{ articleIndex }} 篇 ·
                     {{ article.title || '（未命名文章）' }}
                  </span>
               </div>

               <div data-problem-picker class="relative ml-auto shrink-0">
                  <StButton
                     size="sm"
                     bordered
                     @click="pickerOpened = !pickerOpened">
                     <StSpace align="center" gap="0.375rem">
                        <TableReport size="1rem" />
                        <span>插入题目</span>
                     </StSpace>
                  </StButton>

                  <div
                     v-if="pickerOpened"
                     class="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-[22rem] max-h-[18rem] overflow-auto p-3 rounded-[0.5rem] border border-accent-500 bg-accent-700 shadow-lg">
                     <StSpace direction="vertical" gap="0.5rem" fill-x>
                        <span class="st-font-tooltip text-accent-300">
                           这篇文章已引用的题目
                        </span>

                        <div
                           v-if="!article.problems.length"
                           class="p-3 rounded-[0.375rem] bg-accent-600 st-font-tooltip text-accent-400">
                           这篇文章还没有引用题目，先回发布页的文章列表用「从题库选择」挑几道
                        </div>

                        <template v-else>
                           <button
                              v-for="problem in article.problems"
                              :key="problem.baseId"
                              @click="insertProblem(problem.baseId)"
                              class="w-full p-3 rounded-[0.375rem] bg-accent-600 hover:bg-accent-500 text-left transition-colors cursor-pointer">
                              <StSpace direction="vertical" gap="0.25rem" fill-x>
                                 <span
                                    class="st-font-caption text-accent-100 truncate">
                                    {{ problem.title }}
                                 </span>
                                 <StSpace align="center" gap="0.5rem" fill-x>
                                    <span
                                       class="st-font-tooltip text-accent-400 font-family-manrope">
                                       {{
                                          problem.totalScore
                                             ? `${problem.totalScore} 分`
                                             : '分值待定'
                                       }}
                                    </span>
                                    <span
                                       v-if="
                                          draftProblemCount(problem.baseId)
                                       "
                                       class="ml-auto st-font-tooltip text-success">
                                       正文已插入
                                       {{ draftProblemCount(problem.baseId) }}
                                       次
                                    </span>
                                 </StSpace>
                              </StSpace>
                           </button>
                        </template>
                     </StSpace>
                  </div>
               </div>
            </StSpace>

            <StSplitPanel
               direction="horizontal"
               :start-percent="50"
               class="max-h-[calc(100vh-13rem)]">
               <template #start>
                  <div
                     class="article-editor h-full w-full relative bg-simple-editor-background">
                     <StTextarea
                        ref="bodyInput"
                        v-model:value="draft"
                        spellcheck="false"
                        placeholder="在这里写文章正文，支持 Markdown"
                        outer-class="h-full w-full absolute left-0 top-0 !rounded-none !items-stretch" />
                  </div>
               </template>

               <template #end>
                  <div class="flex-1 h-full overflow-auto p-4">
                     <div :ref="containerKey" class="article-preview"></div>
                  </div>
               </template>
            </StSplitPanel>
         </StSpace>

         <StSpace justify="end" align="center" gap="1rem" class="p-4 w-full">
            <StButton bordered @click="cancel">
               <span>取消</span>
            </StButton>
            <StButton @click="save">
               <StSpace align="center" gap="0.375rem">
                  <SaveOne size="1.25rem" />
                  <span>保存</span>
               </StSpace>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>

<style scoped>
.article-editor :deep(textarea) {
   resize: none;
}

.article-preview :deep(p) {
   margin: 1.25rem 0;
   font-size: 1rem;
   color: var(--color-accent-200);
   line-height: 1.9;
}

.article-preview :deep(h1),
.article-preview :deep(h2),
.article-preview :deep(h3) {
   margin: 2.5rem 0 1rem;
   font-weight: 700;
   color: #fff;
}

.article-preview :deep(h1),
.article-preview :deep(h2) {
   font-size: 1.375rem;
}

.article-preview :deep(h3) {
   font-size: 1.125rem;
}

.article-preview :deep(:first-child) {
   margin-top: 0;
}

.article-preview :deep(ul),
.article-preview :deep(ol) {
   margin: 1.25rem 0;
   padding-left: 1.25rem;
   list-style: disc;
   font-size: 1rem;
   color: var(--color-accent-200);
   line-height: 1.9;
}

.article-preview :deep(ol) {
   list-style: decimal;
}

.article-preview :deep(li + li) {
   margin-top: 0.5rem;
}

.article-preview :deep(blockquote) {
   margin: 1.5rem 0;
   padding: 1rem;
   border-left: 2px solid var(--color-warning);
   border-radius: 0.75rem;
   background: rgb(255 190 49 / 10%);
   color: var(--color-accent-200);
   line-height: 1.8;
}

.article-preview :deep(pre) {
   margin: 1.5rem 0;
   padding: 1.25rem;
   border: 1px solid var(--color-accent-500);
   border-radius: 0.75rem;
   background: var(--color-simple-editor-background);
   overflow-x: auto;
}

.article-preview :deep(pre code) {
   font-family: var(--font-family-mono);
   font-size: 0.875rem;
   color: var(--color-accent-100);
}

.article-preview :deep(p code),
.article-preview :deep(li code) {
   padding: 0.125rem 0.375rem;
   border-radius: 0.375rem;
   background: var(--color-accent-600);
}

.article-preview :deep(a) {
   color: var(--color-secondary);
}

.article-preview :deep(strong) {
   color: #fff;
}
</style>
