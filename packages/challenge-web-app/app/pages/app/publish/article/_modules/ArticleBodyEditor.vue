<script setup lang="ts">
import type { Component } from 'vue';
import type monaco from 'monaco-editor';
import {
   Code,
   CodeComputer,
   DividingLineOne,
   Edit,
   FontSize,
   H1,
   H2,
   H3,
   InsertTable,
   Link,
   List,
   ListCheckbox,
   ListNumbers,
   Picture,
   PreviewOpen,
   Quote,
   Strikethrough,
   TableReport,
   TextBold,
   TextItalic,
} from '@icon-park/vue-next';
import { useMarkdown } from '~/composables/use-markdown';
import { useSimpleEditor } from '~/composables/use-simple-editor';
import type { LearningProblemRef } from '~/composables/use-learning';
import {
   PROBLEM_DIRECTIVE_PATTERN,
   problemDirective,
} from '~/utils/learning-markdown';
import { ARTICLE_TEXT_SIZE_CLASS } from '~/utils/inline-markdown';

/**
 * 正文编辑器：左边写 Markdown，右边实时预览。
 */
const props = defineProps<{
   /** 题库，正文题号从这里取元数据 */
   bank: LearningProblemRef[];
}>();

const body = defineModel<string>('value', { default: '' });

// Monaco 编辑器，markdown 语言、自动换行
const {
   containerKey,
   onEditorReady,
   onEditorContentChanged,
   setEditorContent,
} = useSimpleEditor({
   script: body.value,
   language: 'markdown',
   options: {
      lineNumbers: 'off',
      wordWrap: 'on',
      wrappingStrategy: 'advanced',
      fontSize: 14,
      fontFamily: 'FiraCode Nerd Font Mono, monospace',
   },
});

let monacoInstance: typeof import('monaco-editor') | null = null;
const editorRef = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);

onEditorReady((editor, instance) => {
   editorRef.value = editor;
   monacoInstance = instance;
   editor.onDidChangeCursorSelection(() => syncSelection());
   syncSelection();
});

// 编辑器内容同步回草稿
onEditorContentChanged((value) => {
   body.value = value;
});

// 与文章页同一条渲染管线，编辑时所见即发布后所得
const { html: bodyHtml, update } = useMarkdown({ codeHeader: true });

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

const sizeOptions = SIZE_OPTIONS.map((option) => ({
   label: option.label,
   value: option.key,
}));

const sizeLabelOf = (key: string) =>
   SIZE_OPTIONS.find((option) => option.key === key)?.label ?? '';

/** 字号档位对应 article-text-* 类名，与文章页共用一套 */
const SIZE_CLASS: Record<SizeKey, string> = ARTICLE_TEXT_SIZE_CLASS as Record<
   SizeKey,
   string
>;

const selection = reactive({ start: 0, end: 0, text: '' });

// 光标/选区同步：Monaco 的行列选区换算成正文偏移量，工具栏逻辑只认偏移量
const syncSelection = () => {
   const editor = editorRef.value;
   const model = editor?.getModel();
   const sel = editor?.getSelection();
   if (!editor || !model || !sel) return;
   selection.start = model.getOffsetAt(sel.getStartPosition());
   selection.end = model.getOffsetAt(sel.getEndPosition());
   selection.text = body.value.slice(selection.start, selection.end);
};

const pickerOpened = ref(false);

const hasSelection = computed(() => selection.start !== selection.end);

const activeSize = computed<SizeKey | null>(() => {
   const matched = ARTICLE_TEXT_PATTERN.exec(selection.text);
   return matched ? (matched[1] as SizeKey) : null;
});

const replaceRange = (start: number, end: number, text: string) => {
   const editor = editorRef.value;
   const model = editor?.getModel();
   if (!editor || !model || !monacoInstance) return;
   const from = model.getPositionAt(start);
   const to = model.getPositionAt(end);
   // executeEdits 走 Monaco 自身的撤销栈；内容变化经 onEditorContentChanged 同步回 body
   editor.executeEdits('article-toolbar', [
      {
         range: new monacoInstance.Range(
            from.lineNumber,
            from.column,
            to.lineNumber,
            to.column,
         ),
         text,
      },
   ]);
};

const focusRange = (start: number, end: number) => {
   const editor = editorRef.value;
   const model = editor?.getModel();
   if (!editor || !model || !monacoInstance) return;
   const from = model.getPositionAt(start);
   const to = model.getPositionAt(end);
   editor.setSelection(
      new monacoInstance.Selection(
         from.lineNumber,
         from.column,
         to.lineNumber,
         to.column,
      ),
   );
   editor.focus();
};

/** 用一对标记把选区裹起来；已经是裹着的就取消掉，选区留在文字本身上 */
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
   focusRange(
      wrapped ? start : start + open.length,
      wrapped
         ? start + next.length
         : start + next.length - close.length,
   );
};

const toggleBold = () => toggleWrap(BOLD, BOLD);

/** 选区两端是否正好包着一对标记（按钮激活态） */
const wrapActive = (open: string, close = open) =>
   hasSelection.value &&
   body.value.slice(selection.start - open.length, selection.start) === open &&
   body.value.slice(selection.end, selection.end + close.length) === close;

/** 光标（或选区首行）所在行是否以某前缀开头 */
const lineRangeAt = (position: number) => {
   const start = body.value.lastIndexOf('\n', position - 1) + 1;
   const nl = body.value.indexOf('\n', position);
   return { start, end: nl === -1 ? body.value.length : nl };
};

const lineActive = (prefix: string) =>
   body.value.startsWith(prefix, lineRangeAt(selection.start).start);

/** 给选区覆盖到的每一行切换行首前缀（标题 / 列表 / 引用） */
const toggleLinePrefix = (prefix: string) => {
   const first = lineRangeAt(selection.start).start;
   const last = lineRangeAt(selection.end).end;
   const lines = body.value.slice(first, last).split('\n');
   const allPrefixed = lines.every((line) => line.startsWith(prefix));
   const next = lines
      .map((line) => (allPrefixed ? line.slice(prefix.length) : `${prefix}${line}`))
      .join('\n');
   replaceRange(first, last, next);
   focusRange(first, first + next.length);
};

/** 在光标处插入一段语法；只落光标不产生选区，cursorOffset 指定落点（默认在末尾） */
const insertSnippet = (snippet: string, cursorOffset = snippet.length) => {
   const at = hasSelection.value ? selection.end : selection.start;
   const cursor = at + cursorOffset;
   replaceRange(at, at, snippet);
   focusRange(cursor, cursor);
};

/** 插入独立成块的语法（代码块 / 分割线 / 表格），前面自动补空行 */
const insertBlockSnippet = (snippet: string, cursorOffset?: number) => {
   const before = body.value.slice(0, selection.start);
   const lead =
      !before || before.endsWith('\n\n')
         ? ''
         : before.endsWith('\n')
           ? '\n'
           : '\n\n';
   insertSnippet(
      `${lead}${snippet}\n\n`,
      cursorOffset === undefined ? undefined : lead.length + cursorOffset,
   );
};

const applySize = (size: SizeKey) => {
   if (!hasSelection.value) return;
   const { start, end, text } = selection;
   const matched = ARTICLE_TEXT_PATTERN.exec(text);
   const inner = matched ? matched[2] : text;
   const tag = `<ArticleText size="${size}">`;
   const next = `${tag}${inner}</ArticleText>`;
   replaceRange(start, end, next);
   focusRange(start + tag.length, start + tag.length + inner.length);
};

// 字号 Select 的模型；取消选择时 emit 空串，直接忽略
const sizeSelection = computed<SizeKey | ''>({
   get: () => activeSize.value ?? '',
   set: (value) => {
      if (value) applySize(value);
   },
});

const insertProblem = (baseId: number) => {
   const directive = problemDirective(baseId);
   const at = hasSelection.value ? selection.end : selection.start;
   replaceRange(at, at, directive);
   // 搜到就能插，正文即引用来源
   pickerOpened.value = false;
   focusRange(at + directive.length, at + directive.length);
};

/** 工具栏按钮：needsSelection 的只作用于选中的文字，没选中时置灰 */
type ToolbarButton = {
   icon: Component;
   label: string;
   action: () => void;
   active?: () => boolean;
   needsSelection?: boolean;
};

const toolbarGroups: ToolbarButton[][] = [
   [
      {
         icon: TextBold,
         label: '加粗',
         action: toggleBold,
         active: () => wrapActive(BOLD),
         needsSelection: true,
      },
      {
         icon: TextItalic,
         label: '斜体',
         action: () => toggleWrap('*', '*'),
         active: () => wrapActive('*') && !wrapActive('**'),
         needsSelection: true,
      },
      {
         icon: Strikethrough,
         label: '删除线',
         action: () => toggleWrap('~~', '~~'),
         active: () => wrapActive('~~'),
         needsSelection: true,
      },
      {
         icon: Code,
         label: '行内代码',
         action: () => toggleWrap('`', '`'),
         active: () => wrapActive('`'),
         needsSelection: true,
      },
   ],
   [
      { icon: H1, label: '一级标题', action: () => toggleLinePrefix('# '), active: () => lineActive('# ') },
      { icon: H2, label: '二级标题', action: () => toggleLinePrefix('## '), active: () => lineActive('## ') },
      { icon: H3, label: '三级标题', action: () => toggleLinePrefix('### '), active: () => lineActive('### ') },
   ],
   [
      { icon: List, label: '无序列表', action: () => toggleLinePrefix('- '), active: () => lineActive('- ') },
      { icon: ListNumbers, label: '有序列表', action: () => toggleLinePrefix('1. '), active: () => lineActive('1. ') },
      { icon: ListCheckbox, label: '任务列表', action: () => toggleLinePrefix('- [ ] '), active: () => lineActive('- [ ] ') },
   ],
   [
      { icon: Quote, label: '引用', action: () => toggleLinePrefix('> '), active: () => lineActive('> ') },
      {
         icon: CodeComputer,
         label: '代码块',
         action: () => insertBlockSnippet('```\n\n```', '```\n'.length),
      },
      { icon: DividingLineOne, label: '分割线', action: () => insertBlockSnippet('---') },
   ],
   [
      { icon: Link, label: '链接', action: () => insertSnippet('[标题](地址)') },
      { icon: Picture, label: '图片', action: () => insertSnippet('![描述](图片地址)') },
      {
         icon: InsertTable,
         label: '表格',
         action: () =>
            insertBlockSnippet('| 表头 | 表头 |\n| --- | --- |\n| 内容 | 内容 |'),
      },
      { icon: TableReport, label: '插入题目', action: () => (pickerOpened.value = true) },
   ],
];

// 预览走文章页同一条渲染管线：`<Problem>` 指令换成哨兵注释后切开逐段渲染
const PROBLEM_SLOT = '<!--learning-problem-slot-->';

const markdownSource = computed(() =>
   body.value
      .replace(PROBLEM_DIRECTIVE_PATTERN, `\n\n${PROBLEM_SLOT}\n\n`)
      .replace(ARTICLE_TEXT_GLOBAL_PATTERN, (_, size: string, inner: string) => {
         const cls = SIZE_CLASS[size as SizeKey] ?? SIZE_CLASS.base;
         return `<span class="${cls}">${inner}</span>`;
      }),
);

type BodySegment =
   | { kind: 'html'; html: string }
   | { kind: 'problem'; problem: LearningProblemRef; index: number };

// 题号不在题库里：标注不可用，界面显示「已下架」
const problemRefOf = (baseId: number): LearningProblemRef => {
   const known = props.bank.find((item) => item.baseId === baseId);
   return (
      known ?? {
         baseId,
         pid: 0,
         title: `未知题目 #${baseId}`,
         difficulty: 'medium',
         totalScore: 0,
         unavailable: true,
      }
   );
};

const segments = computed<BodySegment[]>(() => {
   const parts = bodyHtml.value.split(PROBLEM_SLOT);
   const baseIds = [...body.value.matchAll(PROBLEM_DIRECTIVE_PATTERN)].map(
      (match) => Number(match[1]),
   );
   const result: BodySegment[] = [];
   parts.forEach((part, index) => {
      if (part.trim()) result.push({ kind: 'html', html: part });
      if (index < parts.length - 1) {
         result.push({
            kind: 'problem',
            problem: problemRefOf(baseIds[index] ?? 0),
            index,
         });
      }
   });
   return result;
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

// 视图模式：一对按钮切换全编辑 / 对半分 / 全预览；再点一下激活的按钮回到对半分
type ViewMode = 'edit' | 'split' | 'preview';
const viewMode = ref<ViewMode>('split');
const toggleViewMode = (mode: ViewMode) => {
   viewMode.value = viewMode.value === mode ? 'split' : mode;
};

// 模式 -> start 侧比例；StSplitPanel 常驻挂载以保活 Monaco
const splitPercent = computed(() =>
   viewMode.value === 'edit' ? 100 : viewMode.value === 'preview' ? 0 : 50,
);

const render = async () => {
   await update(markdownSource.value);
};

const debouncedRender = useDebounceFn(render, 200);

// 外部回填写进编辑器，自身的写回是 no-op
watch(body, (value) => {
   setEditorContent(value);
   debouncedRender();
});

onMounted(() => render());
</script>

<template>
   <div class="w-full flex flex-col gap-3">
      <div
         class="w-full flex items-center justify-between p-2 rounded-[0.5rem] bg-accent-600/50">
         <StPopover content="字号" placement="bottom" :z-index="10005">
            <StSelect
               v-model:value="sizeSelection"
               :options="sizeOptions"
               placeholder=""
               attach-to-body
               outer-class="!py-1.5 !pl-2.5 !pr-2 !gap-1.5 !rounded-[0.375rem] shrink-0 hover:bg-accent-500"
               options-container-class="!w-[6.5rem] overflow-hidden border-accent-500"
               :class="!hasSelection ? 'pointer-events-none opacity-40' : ''">
               <template #prefix>
                  <FontSize
                     class="shrink-0 text-accent-300"
                     size="1rem"
                     :strokeWidth="3" />
               </template>
               <template #selected-preview="{ value }">
                  <span class="st-font-tooltip text-accent-100">
                     {{ sizeLabelOf(String(value)) }}
                  </span>
               </template>
               <template #option="{ item }">
                  <div class="whitespace-nowrap">{{ item.label }}</div>
               </template>
            </StSelect>
         </StPopover>

         <template v-for="(group, groupIndex) in toolbarGroups" :key="groupIndex">
            <div class="w-[1px] h-[1.25rem] shrink-0 bg-accent-500" />

            <StPopover
               v-for="item in group"
               :key="item.label"
               :content="item.label"
               placement="bottom"
               :z-index="10005">
               <button
                  type="button"
                  :aria-label="item.label"
                  :disabled="item.needsSelection && !hasSelection"
                  class="flex items-center justify-center size-8 shrink-0 rounded-[0.375rem] transition-colors"
                  :class="
                     item.needsSelection && !hasSelection
                        ? 'text-accent-400 cursor-not-allowed'
                        : item.active?.()
                          ? 'bg-secondary text-accent-700'
                          : 'text-accent-100 hover:bg-accent-500 cursor-pointer'
                  "
                  @click="item.action()">
                  <component :is="item.icon" size="1rem" :strokeWidth="3" />
               </button>
            </StPopover>
         </template>

         <div class="w-[1px] h-[1.25rem] shrink-0 bg-accent-500" />

         <StPopover content="全屏编辑" placement="bottom" :z-index="10005">
            <button
               type="button"
               aria-label="全屏编辑"
               class="flex items-center justify-center size-8 shrink-0 rounded-[0.375rem] transition-colors"
               :class="
                  viewMode === 'edit'
                     ? 'bg-secondary text-accent-700'
                     : 'text-accent-100 hover:bg-accent-500 cursor-pointer'
               "
               @click="toggleViewMode('edit')">
               <Edit size="1rem" :strokeWidth="3" />
            </button>
         </StPopover>
         <StPopover content="全屏预览" placement="bottom" :z-index="10005">
            <button
               type="button"
               aria-label="全屏预览"
               class="flex items-center justify-center size-8 shrink-0 rounded-[0.375rem] transition-colors"
               :class="
                  viewMode === 'preview'
                     ? 'bg-secondary text-accent-700'
                     : 'text-accent-100 hover:bg-accent-500 cursor-pointer'
               "
               @click="toggleViewMode('preview')">
               <PreviewOpen size="1rem" :strokeWidth="3" />
            </button>
         </StPopover>
      </div>

      <div
         class="w-full h-[45rem]"
         :class="viewMode !== 'split' ? 'article-split-full' : ''">
         <StSplitPanel direction="horizontal" :start-percent="splitPercent">
            <template #start>
               <div
                  class="h-full w-full relative bg-simple-editor-background rounded-[0.375rem] overflow-hidden">
                  <div
                     :ref="containerKey"
                     class="absolute left-0 top-0 h-full w-full" />
               </div>
            </template>

            <template #end>
               <div
                  v-show="viewMode !== 'edit'"
                  class="h-full overflow-auto p-4"
                  :class="
                     viewMode === 'preview' ? 'w-[calc(100%+0.75rem)]' : ''
                  ">
                  <template
                     v-for="(segment, index) in segments"
                     :key="index">
                     <LearningProblemBlock
                        v-if="segment.kind === 'problem'"
                        variant="source"
                        :problem="segment.problem"
                        @remove="removeProblemAt(segment.index)" />
                     <LearningArticleBody v-else :html="segment.html" />
                  </template>
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
/* 全编辑 / 全预览模式下隐藏 StSplitPanel 的分隔条（不改组件本身） */
.article-split-full :deep([role='separator']) {
   display: none;
}
</style>
