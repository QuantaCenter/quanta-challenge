<script setup lang="ts">
import {
   Code,
   CodeBrackets,
   DividingLine,
   H1,
   H2,
   H3,
   InsertTable,
   Link,
   List,
   ListCheckbox,
   LoadingFour,
   OrderedList,
   Pic,
   PlayOne,
   Quote,
   Redo,
   Strikethrough,
   TextBold,
   TextItalic,
   Undo,
} from '@icon-park/vue-next';
import type { Component } from 'vue';
import type { MarkdownToolbarAction } from '~/utils/markdown-format';

const props = defineProps<{
   /** 图片上传中：图片按钮显示加载态并禁用 */
   uploading?: boolean;
   /** 正文字数（不含空白） */
   charCount?: number;
   /** 展示「插入演练」按钮（仅课程图文小节需要） */
   playground?: boolean;
}>();

const emit = defineEmits<{
   action: [id: MarkdownToolbarAction];
}>();

interface IToolbarItem {
   id: MarkdownToolbarAction;
   label: string;
   icon: Component;
   /** 快捷键（不含修饰键），仅用于提示 */
   shortcut?: string;
}

/** 分组之间用竖线分隔 */
const groups = computed<IToolbarItem[][]>(() => [
   [
      { id: 'undo', label: '撤销', icon: Undo, shortcut: 'Z' },
      { id: 'redo', label: '重做', icon: Redo, shortcut: 'Shift+Z' },
   ],
   [
      { id: 'h1', label: '一级标题', icon: H1 },
      { id: 'h2', label: '二级标题', icon: H2 },
      { id: 'h3', label: '三级标题', icon: H3 },
   ],
   [
      { id: 'bold', label: '加粗', icon: TextBold, shortcut: 'B' },
      { id: 'italic', label: '斜体', icon: TextItalic, shortcut: 'I' },
      { id: 'strike', label: '删除线', icon: Strikethrough, shortcut: 'Shift+X' },
      { id: 'inlineCode', label: '行内代码', icon: Code, shortcut: 'E' },
   ],
   [
      { id: 'quote', label: '引用', icon: Quote },
      { id: 'ul', label: '无序列表', icon: List },
      { id: 'ol', label: '有序列表', icon: OrderedList },
      { id: 'task', label: '任务列表', icon: ListCheckbox },
   ],
   [
      { id: 'link', label: '链接', icon: Link },
      { id: 'image', label: '插入图片', icon: Pic },
      { id: 'table', label: '表格', icon: InsertTable },
      { id: 'codeBlock', label: '代码块', icon: CodeBrackets },
      { id: 'hr', label: '分割线', icon: DividingLine },
      ...(props.playground
         ? [{ id: 'playground' as const, label: '插入演练', icon: PlayOne }]
         : []),
   ],
]);

// 修饰键只在客户端确定，避免 SSR / 水合时提示文案不一致
const modKey = ref('Ctrl');
onMounted(() => {
   if (/Mac|iPhone|iPad/i.test(navigator.platform)) modKey.value = '⌘';
});

const tip = (item: IToolbarItem) =>
   item.shortcut
      ? `${item.label}（${modKey.value}${modKey.value === '⌘' ? '' : '+'}${item.shortcut}）`
      : item.label;

const isBusy = (item: IToolbarItem) => item.id === 'image' && props.uploading;
</script>

<template>
   <div
      role="toolbar"
      aria-label="Markdown 工具栏"
      class="flex w-full items-center gap-1 overflow-x-auto rounded-[0.75rem] border border-accent-600 bg-accent-700 px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <template v-for="(group, groupIndex) in groups" :key="groupIndex">
         <span
            v-if="groupIndex > 0"
            aria-hidden="true"
            class="mx-1 h-5 w-px shrink-0 bg-accent-500"></span>
         <StPopover
            v-for="item in group"
            :key="item.id"
            :content="tip(item)"
            :z-index="10005"
            placement="bottom"
            class="shrink-0">
            <button
               type="button"
               :aria-label="item.label"
               :disabled="isBusy(item)"
               class="flex size-8 items-center justify-center rounded-[0.5rem] text-accent-200 transition-all hover:cursor-pointer hover:bg-accent-600 hover:text-primary active:scale-90 disabled:cursor-wait disabled:opacity-60"
               @mousedown.prevent
               @click="emit('action', item.id)">
               <LoadingFour
                  v-if="isBusy(item)"
                  size="1.125rem"
                  class="animate-spin" />
               <component :is="item.icon" v-else size="1.125rem" />
            </button>
         </StPopover>
      </template>
      <span
         v-if="props.charCount !== undefined"
         class="ml-auto shrink-0 pl-3 text-xs text-accent-300 tabular-nums select-none">
         {{ props.charCount }} 字
      </span>
   </div>
</template>
