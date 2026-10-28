<script setup lang="ts">
import { useSimpleEditor } from '~/composables/use-simple-editor';

const props = withDefaults(
   defineProps<{
      language: 'html' | 'css' | 'javascript';
      height?: string;
      wordWrap?: boolean;
   }>(),
   { height: '22rem', wordWrap: true },
);

const value = defineModel<string>('value', { default: '' });
const ready = ref(false);

const {
   containerKey,
   onEditorReady,
   onEditorContentChanged,
   setEditorContent,
} = useSimpleEditor({
   script: value.value,
   language: props.language,
   containerRef: 'learning-monaco-editor',
   options: {
      fontSize: 14,
      lineHeight: 22,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      padding: { top: 14, bottom: 14 },
      renderLineHighlight: 'line',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      wordWrap: 'on',
      tabSize: 2,
   },
});

onEditorContentChanged((content) => {
   if (content !== value.value) value.value = content;
});

onEditorReady((editor, monaco) => {
   ready.value = true;
   watch(
      () => props.wordWrap,
      (enabled) => editor.updateOptions({ wordWrap: enabled ? 'on' : 'off' }),
      { immediate: true },
   );
   watch(
      () => props.language,
      (language) => {
         const model = editor.getModel();
         if (model) monaco.editor.setModelLanguage(model, language);
      },
      { immediate: true },
   );
});

watch(value, (content) => setEditorContent(content ?? ''));
</script>

<template>
   <div
      class="relative w-full overflow-hidden bg-[#1c1c1c]"
      :style="{ height }">
      <StSkeleton v-if="!ready" loading class="absolute inset-0 p-4">
         <template #loading>
            <StSpace direction="vertical" gap="0.75rem">
               <StSkeletonItem class="h-4 w-3/4 rounded" />
               <StSkeletonItem class="h-4 w-1/2 rounded" />
               <StSkeletonItem class="h-4 w-2/3 rounded" />
            </StSpace>
         </template>
      </StSkeleton>
      <div
         v-show="ready"
         :ref="containerKey"
         class="absolute inset-0" />
   </div>
</template>
