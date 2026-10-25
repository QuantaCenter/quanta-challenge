<script setup lang="ts">
import type { editor } from 'monaco-editor';
import { isTouchDevice } from '~/composables/monaco-mobile-support';

interface IProps {
   onEditorInstanceReady: (
      callback: (instance: editor.IStandaloneCodeEditor) => void
   ) => void;
}

const props = defineProps<IProps>();

/** 仅触屏设备启用 */
const isTouch = isTouchDevice();
const isVisible = ref(false);

let instance: editor.IStandaloneCodeEditor | null = null;

props.onEditorInstanceReady((editorInstance) => {
   instance = editorInstance;
   instance.onDidFocusEditorText(() => (isVisible.value = true));
   instance.onDidBlurEditorText(() => (isVisible.value = false));
});

/** 通过 trigger 执行命令，避免抢焦点 */
const triggerCommand = (commandId: string) => {
   instance?.trigger('mobile-toolbar', commandId, null);
   instance?.focus();
};

/** 在当前选区插入文本；开括号 / 引号交给 Monaco 自动补全配对 */
const insertText = (text: string) => {
   if (!instance) return;
   const selection = instance.getSelection();
   selection &&
      instance.executeEdits('mobile-toolbar', [{ range: selection, text }]);
   instance.focus();
};

const commandKeys = [
   { label: '↩', command: 'undo', title: '撤销' },
   { label: '↪', command: 'redo', title: '重做' },
   { label: '⇥', command: 'tab', title: '缩进' },
   { label: '←', command: 'cursorLeft', title: '左移光标' },
   { label: '→', command: 'cursorRight', title: '右移光标' },
   { label: '↑', command: 'cursorUp', title: '上移光标' },
   { label: '↓', command: 'cursorDown', title: '下移光标' },
];

const textKeys = [
   '(',
   ')',
   '[',
   ']',
   '{',
   '}',
   '<',
   '>',
   '"',
   "'",
   '`',
   ';',
   ':',
   '=',
   ',',
   '.',
   '/',
   '\\',
   '!',
   '?',
   '&',
   '|',
   '+',
   '-',
   '*',
   '_',
   '#',
   '@',
];
</script>

<template>
   <Transition
      enter-active-class="transition-all duration-150"
      enter-from-class="translate-y-full opacity-0"
      leave-active-class="transition-all duration-150"
      leave-to-class="translate-y-full opacity-0">
      <div
         v-if="isTouch && isVisible"
         class="absolute bottom-0 left-0 right-0 z-[10] flex items-center gap-0.5 overflow-x-auto px-2 py-1.5 bg-accent-600/95 backdrop-blur-sm border-t border-accent-500 mini-scrollbar select-none"
         @touchstart.stop
         @touchmove.stop
         @touchend.stop>
         <button
            v-for="key in commandKeys"
            :key="key.command"
            type="button"
            :title="key.title"
            class="shrink-0 size-8 rounded-md text-accent-100 bg-accent-500 text-sm flex items-center justify-center active:bg-primary active:text-white transition-colors"
            @pointerdown.prevent="triggerCommand(key.command)">
            {{ key.label }}
         </button>
         <span class="shrink-0 w-px h-6 mx-1 bg-accent-400" />
         <button
            v-for="key in textKeys"
            :key="key"
            type="button"
            class="shrink-0 size-8 rounded-md text-accent-100 bg-accent-500 text-sm flex items-center justify-center active:bg-primary active:text-white transition-colors"
            @pointerdown.prevent="insertText(key)">
            {{ key }}
         </button>
      </div>
   </Transition>
</template>
