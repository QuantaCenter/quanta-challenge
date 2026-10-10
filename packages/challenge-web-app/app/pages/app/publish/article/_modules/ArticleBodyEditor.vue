<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue';
import { FontSize, TableReport, TextBold } from '@icon-park/vue-next';
import { useMarkdown } from '~/composables/use-markdown';
import type { LearningProblemRef } from '~/composables/use-learning';
import {
   PROBLEM_DIRECTIVE_PATTERN,
   problemDirective,
} from '~/utils/learning-markdown';
import { ARTICLE_TEXT_SIZE_CLASS } from '~/utils/inline-markdown';

/**
 * 正文编辑器：左边写 Markdown 源码，右边实时预览。
 *
 * 工具栏只作用于**选中的文字**（设计文档 §13.2）：没选中任何内容时加粗与字号置灰，
 * 不去猜光标所在块的意图；按钮的激活态也跟随当前选中内容的样式。
 * 插入题目把 `<Problem baseId={...} />` 写进正文（§13.3）。
 */
const props = defineProps<{
   /** 题库：正文里写到的任何题号都从这里取标题 / 难度 / 分值 */
   bank: LearningProblemRef[];
}>();

const body = defineModel<string>('value', { default: '' });

const { html, update } = useMarkdown();

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

const BOLD = '**';
const ARTICLE_TEXT_PATTERN = /^<ArticleText size="(sm|base|lg)">([\s\S]*)<\/ArticleText>$/;
const ARTICLE_TEXT_GLOBAL_PATTERN =
   /<ArticleText size="(sm|base|lg)">([\s\S]*?)<\/ArticleText>/g;

const SIZE_OPTIONS = [
   { key: 'sm', label: '小' },
   { key: 'base', label: '中' },
   { key: 'lg', label: '大' },
] as const;

type SizeKey = (typeof SIZE_OPTIONS)[number]['key'];

/**
 * 字号档位 → 类名。
 *
 * ⚠️ 必须与文章页用**同一套类名**（`article-text-*`，定义在 `assets/css/tailwind.css`）。
 * 之前这里用 Tailwind 的原子类（`text-[1rem]` 等），文章页用的是
 * `article-text-lg`——而后者当时**根本没有样式定义**，于是"编辑器里看着变大、
 * 发布后字号不变"。统一成一套就没这个缝了。
 */
const SIZE_CLASS: Record<SizeKey, string> = ARTICLE_TEXT_SIZE_CLASS as Record<
   SizeKey,
   string
>;

const bodyInput = useTemplateRef<ComponentPublicInstance>('bodyInput');
const pickerOpened = ref(false);

// StTextarea 的模板 ref 拿到的是组件实例，真正的光标与选区在里面的 textarea 上
const textareaEl = () => {
   const root = bodyInput.value?.$el as HTMLElement | undefined;
   return root?.querySelector('textarea') ?? null;
};

const selection = reactive({ start: 0, end: 0, text: '' });

const syncSelection = () => {
   const el = textareaEl();
   if (!el) return;
   const start = el.selectionStart ?? 0;
   const end = el.selectionEnd ?? 0;
   selection.start = start;
   selection.end = end;
   selection.text = body.value.slice(start, end);
};

const hasSelection = computed(() => selection.start !== selection.end);

const boldActive = computed(
   () =>
      hasSelection.value &&
      body.value.slice(selection.start - BOLD.length, selection.start) === BOLD &&
      body.value.slice(selection.end, selection.end + BOLD.length) === BOLD,
);

const activeSize = computed<SizeKey | null>(() => {
   const matched = ARTICLE_TEXT_PATTERN.exec(selection.text);
   return matched ? (matched[1] as SizeKey) : null;
});

const replaceRange = (start: number, end: number, text: string) => {
   body.value = `${body.value.slice(0, start)}${text}${body.value.slice(end)}`;
};

const focusRange = (start: number, end: number) => {
   nextTick(() => {
      const el = textareaEl();
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
      syncSelection();
   });
};

/** 用一对标记把选区裹起来；已经是裹着的就取消掉 */
const toggleWrap = (open: string, close: string) => {
   if (!hasSelection.value) return;
   const { start, end, text } = selection;
   const wrapped =
      text.length >= open.length + close.length &&
      text.startsWith(open) &&
      text.endsWith(close);

   const inner = wrapped
      ? text.slice(open.length, text.length - close.length)
      : text;
   const next = wrapped ? inner : `${open}${inner}${close}`;
   replaceRange(start, end, next);
   focusRange(start, start + next.length);
};

const toggleBold = () => toggleWrap(BOLD, BOLD);

const applySize = (size: SizeKey) => {
   if (!hasSelection.value) return;
   const { start, end, text } = selection;
   const matched = ARTICLE_TEXT_PATTERN.exec(text);
   const inner = matched ? matched[2] : text;
   const next = `<ArticleText size="${size}">${inner}</ArticleText>`;
   replaceRange(start, end, next);
   focusRange(start, start + next.length);
};

const insertProblem = (baseId: number) => {
   const directive = problemDirective(baseId);
   const at = hasSelection.value ? selection.end : selection.start;
   replaceRange(at, at, directive);
   // 搜到就能插：正文本身就是「引用了哪些题」的来源，不需要先去别处勾选
   pickerOpened.value = false;
   focusRange(at, at + directive.length);
};

const escapeHtml = (text: string) =>
   text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const problemCardOf = (baseId: number, index: number) => {
   const problem = props.bank.find((item) => item.baseId === baseId);
   const difficulty = problem?.difficulty ?? 'medium';
   const label = DIFFICULTY_LABEL[difficulty] ?? '中等';
   const color = DIFFICULTY_COLOR[difficulty] ?? '#ffbe31';
   const tagText = label === '简单' || label === '中等' ? '#1a1a1a' : '#ffffff';
   const title = problem ? escapeHtml(problem.title) : `未知题目 #${baseId}`;
   const score = problem ? `${problem.totalScore} 分` : '分值待定';

   return [
      '<div class="problem-block my-4 rounded-[0.75rem] border border-accent-500 bg-accent-600 overflow-hidden">',
      '<div class="flex items-center gap-3 p-3">',
      '<div class="min-w-0 flex-1 flex flex-col gap-[0.375rem]">',
      `<span class="text-[0.875rem] font-bold truncate text-accent-100">${title}</span>`,
      '<div class="flex flex-wrap items-center gap-[0.5rem]">',
      `<span class="px-[0.5rem] py-[0.125rem] rounded-full text-[0.625rem] font-bold" style="background-color:${color};color:${tagText}">${label}</span>`,
      `<span class="text-[0.75rem] text-accent-400 font-family-manrope">${score}</span>`,
      `<span class="text-[0.75rem] text-accent-400 font-family-manrope">base ${baseId}</span>`,
      '</div>',
      '</div>',
      '<span class="shrink-0 hidden sm:inline px-[0.75rem] py-[0.375rem] rounded-[0.375rem] border border-accent-400 text-[0.75rem] text-accent-300">去做题</span>',
      `<button type="button" data-problem-remove="${index}" title="从正文里删掉这道题" aria-label="从正文里删掉这道题" class="shrink-0 flex items-center justify-center size-7 rounded-[0.375rem] text-accent-400 hover:bg-error/20 hover:text-error transition-colors cursor-pointer"><svg viewBox="0 0 48 48" width="0.8125rem" height="0.8125rem" fill="none"><path d="M10 10L38 38M38 10L10 38" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg></button>`,
      '</div>',
      '</div>',
   ].join('');
};

const previewHtml = computed(() => {
   let index = 0;
   return html.value
      .replace(PROBLEM_DIRECTIVE_PATTERN, (_, id: string) =>
         problemCardOf(Number(id), index++),
      )
      .replace(ARTICLE_TEXT_GLOBAL_PATTERN, (_, size: string, inner: string) => {
         const cls = SIZE_CLASS[size as SizeKey] ?? SIZE_CLASS.base;
         return `<span class="${cls}">${inner}</span>`;
      });
});

// 正文里的第 index 个 <Problem> 指令
const removeProblemAt = (index: number) => {
   const matches = [...body.value.matchAll(PROBLEM_DIRECTIVE_PATTERN)];
   const match = matches[index];
   if (!match || match.index === undefined) return;
   const start = match.index;
   const end = start + match[0].length;
   body.value = `${body.value.slice(0, start)}${body.value.slice(end)}`.replace(
      /\n{3,}/g,
      '\n\n',
   );
};

const onPreviewClick = (event: MouseEvent) => {
   const trigger = (event.target as HTMLElement | null)?.closest(
      '[data-problem-remove]',
   );
   if (!trigger) return;
   event.preventDefault();
   removeProblemAt(Number(trigger.getAttribute('data-problem-remove')));
};

const render = async () => {
   await update(body.value);
};

const debouncedRender = useDebounceFn(render, 200);

watch(body, () => debouncedRender());

onMounted(() => {
   render();
   syncSelection();
});
</script>

<template>
   <div class="w-full flex flex-col gap-3">
      <div
         class="w-full flex items-center gap-2 p-3 rounded-[0.5rem] border border-accent-300">
         <button
            type="button"
            title="加粗选中的文字"
            aria-label="加粗"
            :disabled="!hasSelection"
            class="flex items-center justify-center size-8 rounded-[0.375rem] transition-colors"
            :class="
               hasSelection
                  ? boldActive
                     ? 'bg-secondary text-accent-700 cursor-pointer'
                     : 'bg-accent-600 text-accent-100 hover:bg-accent-500 cursor-pointer'
                  : 'bg-accent-600/40 text-accent-400 cursor-not-allowed'
            "
            @click="toggleBold">
            <TextBold size="1rem" :strokeWidth="3" />
         </button>

         <div class="w-[1px] h-[1.25rem] bg-accent-400 mx-1" />

         <StSpace align="center" gap="0.375rem">
            <FontSize class="shrink-0 text-accent-300" size="1rem" :strokeWidth="3" />
            <span class="st-font-tooltip text-accent-400">字号</span>
            <button
               v-for="option in SIZE_OPTIONS"
               :key="option.key"
               type="button"
               :title="`把选中的文字设为${option.label}号`"
               :disabled="!hasSelection"
               class="px-[0.625rem] py-[0.25rem] rounded-[0.375rem] st-font-tooltip transition-colors"
               :class="
                  hasSelection
                     ? activeSize === option.key
                        ? 'bg-secondary text-accent-700 cursor-pointer'
                        : 'bg-accent-600 text-accent-100 hover:bg-accent-500 cursor-pointer'
                     : 'bg-accent-600/40 text-accent-400 cursor-not-allowed'
               "
               @click="applySize(option.key)">
               {{ option.label }}
            </button>
         </StSpace>

         <div class="ml-auto shrink-0">
            <StButton size="sm" bordered @click="pickerOpened = true">
               <StSpace align="center" gap="0.375rem">
                  <TableReport size="1rem" />
                  <span>插入题目</span>
               </StSpace>
            </StButton>
         </div>
      </div>

      <div class="w-full h-[45rem]">
         <StSplitPanel direction="horizontal" :start-percent="50">
            <template #start >
               <div
                  class="article-editor rounded-[0.375rem] h-full w-full relative bg-simple-editor-background">
                  <StTextarea
                     ref="bodyInput"
                     v-model:value="body"
                     spellcheck="false"
                     placeholder="在这里写正文，支持 Markdown；题目用右上角的「插入题目」写进来"
                     outer-class="h-full w-full absolute left-0 top-0 !rounded-none !items-stretch"
                     @click="syncSelection"
                     @keyup="syncSelection"
                     @select="syncSelection"
                     @input="syncSelection" />
               </div>
            </template>

            <template #end>
               <div class="flex-1 h-full overflow-auto p-4" @click="onPreviewClick">
                  <StMarkdownPreview :html="previewHtml" />
               </div>
            </template>
         </StSplitPanel>
      </div>

      <LearningContentPicker
         v-model:opened="pickerOpened"
         kind="problem"
         @pick="insertProblem" />
   </div>
</template>

<style scoped>
.article-editor :deep(textarea) {
   resize: none;
   font-family: var(--font-family-mono);
   font-size: 0.875rem;
}
</style>
