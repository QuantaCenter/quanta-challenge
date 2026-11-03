<script setup lang="ts">
import { SaveOne } from '@icon-park/vue-next';
import type monaco from 'monaco-editor';
import { useMessage } from '~/components/st/Message/use-message';
import { useMarkdown } from '~/composables/use-markdown';
import { useSimpleEditor } from '~/composables/use-simple-editor';
import { isTouchDevice } from '~/composables/monaco-mobile-support';
import {
   insertCodeBlock,
   insertHorizontalRule,
   insertLink,
   insertTable,
   toggleInlineWrap,
   toggleLinePrefix,
   type MarkdownEdit,
   type MarkdownToolbarAction,
} from '~/utils/markdown-format';
import MarkdownToolbar from './MarkdownToolbar.vue';

const script = defineModel<string>('markdown');
const opened = defineModel<boolean>('opened', { default: false });

const props = withDefaults(
   defineProps<{
      /** 抽屉标题 */
      drawerTitle?: string;
      width?: string;
   }>(),
   { drawerTitle: '编辑题目详情', width: '60rem' },
);

const { containerKey, onEditorContentChanged, setEditorContent, onEditorReady } =
   useSimpleEditor({
      script: script.value ?? '',
      language: 'markdown',
      options: {
         lineNumbers: 'off',
         wordWrap: 'on',
         wrappingStrategy: 'advanced',
      },
   });
const { html, update } = useMarkdown();
const debounceUpdate = useDebounceFn(update, 200);
const message = useMessage();
const { $trpc } = useNuxtApp();

/** 仅移动端（触屏设备）上下排布，PC 端始终左右排布 */
const isMobile = isTouchDevice();

const uploadingImage = ref(false);
const imageFileInput = useTemplateRef<HTMLInputElement>('image-file-input');
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;
let monacoInstance: typeof import('monaco-editor') | null = null;

onEditorContentChanged((value) => {
   script.value = value;
   debounceUpdate(value);
});

watch(script, (value) => {
   if (value) {
      setEditorContent(value);
      debounceUpdate(value);
   }
});

update(script.value ?? '');

onEditorReady((editor, monaco) => {
   editorInstance = editor;
   monacoInstance = monaco;
   const { KeyMod, KeyCode } = monaco;
   editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyB, () => runAction('bold'));
   editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyI, () => runAction('italic'));
   editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyE, () =>
      runAction('inlineCode')
   );
   editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX, () =>
      runAction('strike')
   );
   const domNode = editor.getDomNode();
   if (!domNode) return;
   domNode.addEventListener('paste', (event) => {
      const file = Array.from(event.clipboardData?.files ?? []).find(
         (item) => item.type.startsWith('image/')
      );
      if (!file) return;
      event.preventDefault();
      uploadAndInsertImage(file);
   });
   domNode.addEventListener('dragover', (event) => {
      if (
         Array.from(event.dataTransfer?.items ?? []).some(
            (item) => item.kind === 'file' && item.type.startsWith('image/')
         )
      ) {
         event.preventDefault();
      }
   });
   domNode.addEventListener('drop', (event) => {
      const file = Array.from(event.dataTransfer?.files ?? []).find(
         (item) => item.type.startsWith('image/')
      );
      if (!file) return;
      event.preventDefault();
      uploadAndInsertImage(file);
   });
});

const insertAtCursor = (text: string) => {
   const editor = editorInstance;
   const position = editor?.getPosition();
   if (!editor || !position || !monacoInstance) return;
   editor.executeEdits('insert-image', [
      {
         range: new monacoInstance.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column
         ),
         text,
      },
   ]);
   editor.focus();
};

const uploadAndInsertImage = async (file: File) => {
   if (!file.type.startsWith('image/')) {
      message.error('插入图片失败', '只能插入图片文件');
      return;
   }
   if (file.size > 5 * 1024 * 1024) {
      message.error('插入图片失败', '图片大小不能超过 5MB');
      return;
   }
   uploadingImage.value = true;
   try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await $trpc.admin.image.upload.mutate(formData);
      const alt =
         file.name
            .replace(/\.[^.]+$/, '')
            .replace(/[[\]()]/g, '')
            .trim() || 'image';
      insertAtCursor(`![${alt}](/api/static/${res.name})`);
   } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error('图片上传失败', errorMsg);
   } finally {
      uploadingImage.value = false;
   }
};

const pickImage = () => imageFileInput.value?.click();

/** 正文字数（不含空白） */
const charCount = computed(
   () => (script.value ?? '').replace(/\s/g, '').length
);

/** 把一次纯文本变换应用到编辑器：保持撤销栈完整，并还原为变换后的选区 */
const applyEdit = (
   build: (text: string, start: number, end: number) => MarkdownEdit
) => {
   const editor = editorInstance;
   const monaco = monacoInstance;
   const model = editor?.getModel();
   const selection = editor?.getSelection();
   if (!editor || !monaco || !model || !selection) return;

   // 变换逻辑按 `\n` 计算偏移，CRLF 文档先统一成 LF
   if (model.getEOL() !== '\n') {
      model.setEOL(monaco.editor.EndOfLineSequence.LF);
   }

   const edit = build(
      model.getValue(),
      model.getOffsetAt(selection.getStartPosition()),
      model.getOffsetAt(selection.getEndPosition())
   );
   const from = model.getPositionAt(edit.from);
   const to = model.getPositionAt(edit.to);

   editor.pushUndoStop();
   editor.executeEdits('markdown-toolbar', [
      {
         range: new monaco.Range(
            from.lineNumber,
            from.column,
            to.lineNumber,
            to.column
         ),
         text: edit.insert,
         forceMoveMarkers: true,
      },
   ]);
   const selectFrom = model.getPositionAt(edit.selectFrom);
   const selectTo = model.getPositionAt(edit.selectTo);
   editor.setSelection(
      new monaco.Selection(
         selectFrom.lineNumber,
         selectFrom.column,
         selectTo.lineNumber,
         selectTo.column
      )
   );
   editor.pushUndoStop();
   editor.focus();
};

const runAction = (id: MarkdownToolbarAction) => {
   switch (id) {
      case 'undo':
      case 'redo':
         editorInstance?.focus();
         editorInstance?.trigger('markdown-toolbar', id, null);
         break;
      case 'image':
         pickImage();
         break;
      case 'bold':
         applyEdit((t, s, e) => toggleInlineWrap(t, s, e, '**', '粗体文本'));
         break;
      case 'italic':
         applyEdit((t, s, e) => toggleInlineWrap(t, s, e, '*', '斜体文本'));
         break;
      case 'strike':
         applyEdit((t, s, e) => toggleInlineWrap(t, s, e, '~~', '删除线文本'));
         break;
      case 'inlineCode':
         applyEdit((t, s, e) => toggleInlineWrap(t, s, e, '`', 'code'));
         break;
      case 'h1':
      case 'h2':
      case 'h3':
      case 'quote':
      case 'ul':
      case 'ol':
      case 'task':
         applyEdit((t, s, e) => toggleLinePrefix(t, s, e, id));
         break;
      case 'link':
         applyEdit(insertLink);
         break;
      case 'table':
         applyEdit(insertTable);
         break;
      case 'codeBlock':
         applyEdit(insertCodeBlock);
         break;
      case 'hr':
         applyEdit(insertHorizontalRule);
         break;
   }
};

const onImageFileChosen = (event: Event) => {
   const input = event.target as HTMLInputElement;
   const file = input.files?.[0];
   if (file) uploadAndInsertImage(file);
   input.value = '';
};
</script>

<template>
   <StDrawer global v-model:opened="opened" :width="props.width">
      <StSpace direction="vertical" gap="1rem" class="text-white h-full">
         <StSpace direction="vertical" gap="1.5rem" class="p-6 w-full h-full">
            <!-- Header -->
            <StSpace justify="between" align="center" class="w-full">
               <h1 class="st-font-secondary-bold max-md:text-[1.25rem]">{{ props.drawerTitle }}</h1>
            </StSpace>
            <MarkdownToolbar
               :uploading="uploadingImage"
               :char-count="charCount"
               @action="runAction" />
            <input
               ref="image-file-input"
               type="file"
               accept="image/*"
               class="hidden"
               @change="onImageFileChosen" />
            <StSplitPanel
               :direction="isMobile ? 'vertical' : 'horizontal'"
               class="max-h-[calc(100vh-17.5rem)]">
               <template #start>
                  <div
                     class="h-full w-full relative bg-simple-editor-background">
                     <div
                        :ref="containerKey"
                        class="flex flex-1 h-full w-full absolute left-0 top-0"></div>
                  </div>
               </template>
               <template #end>
                  <div class="min-w-0 min-h-0 w-full h-full overflow-auto p-4">
                     <StMarkdownPreview :html="html" />
                  </div>
               </template>
            </StSplitPanel>
         </StSpace>
         <!-- Bottom -->
         <StSpace justify="end" class="p-4 w-full">
            <StButton
               @click="opened = false"
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]">
               <div class="flex gap-2 items-center">
                  <SaveOne class="text-[1.5rem]" />
                  <span>保存</span>
               </div>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
