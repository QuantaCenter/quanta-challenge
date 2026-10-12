<script setup lang="ts">
import { useSimpleEditor } from '~/composables/use-simple-editor';

/** 基于 useSimpleEditor 的文本编辑器（键值对文本方式 / 请求体共用）。 */
const props = withDefaults(
   defineProps<{ language?: string; readonly?: boolean; wrap?: boolean }>(),
   { language: 'plaintext', readonly: false, wrap: false },
);
const model = defineModel<string>({ default: '' });

const { containerKey, onEditorReady, setEditorContent, getEditor } =
   useSimpleEditor({
      script: model.value,
      language: props.language,
      containerRef: 'kv-text-editor',
   });

onEditorReady((editor) => {
   editor.updateOptions({
      readOnly: props.readonly,
      wordWrap: props.wrap ? 'on' : 'off',
   });
   // 自己挂监听（不走 useSimpleEditor 的 content-changed 回调），同步链路少一层
   editor.onDidChangeModelContent(() => {
      model.value = editor.getValue();
   });
   editor.focus();
});

watch(() => props.readonly, (value) =>
   getEditor()?.updateOptions({ readOnly: value }),
);
watch(() => props.wrap, (value) =>
   getEditor()?.updateOptions({ wordWrap: value ? 'on' : 'off' }),
);

// 外部换了一份文本（例如切换列表 / 点「美化」）时同步进来
watch(model, (value) => setEditorContent(value));

// 调用方可以直接读写编辑器内容，不必依赖 v-model 的同步链
defineExpose({
   getValue: () => getEditor()?.getValue() ?? model.value,
   setValue: (value: string) => setEditorContent(value),
});
</script>

<template>
   <div :ref="containerKey" class="size-full" />
</template>
