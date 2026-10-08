<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core';
import { useShiki } from '~/composables/use-shiki';
import langVue from 'shiki/langs/vue.mjs';
import langTsx from 'shiki/langs/tsx.mjs';
import langJsx from 'shiki/langs/jsx.mjs';

const props = defineProps<{
   code: string;
   language?: string;
}>();

const emits = defineEmits(['ready']);

const { highlightHtml, highlightCode, onReady } = useShiki({
   languages: [langVue, langTsx, langJsx],
});
onReady(() => emits('ready'));

const debouncedHighlightCode = useDebounceFn(highlightCode, 50);
watch(
   () => props.code,
   (code) => debouncedHighlightCode(code, props.language),
   { immediate: true }
);

// 高亮器在 useShiki 的 onMounted 里同步初始化。setup 期那次 watch 因为还没
// 初始化会直接 return，而 code 之后不再变化时 watch 也不会再触发，于是
// highlightHtml 永远为空、ready 也永远不发（「如何调用」整块被 v-show 隐藏）。
// 这里在初始化完成后补跑一次，保证静态代码也能高亮并发出 ready。
onMounted(() => {
   debouncedHighlightCode(props.code, props.language);
});
</script>

<template>
   <div class="!font-family-fira-code">
      <div v-if="highlightHtml" v-html="highlightHtml" class="code"></div>
      <div v-else class="code text-accent-200">
         <pre>{{ props.code }}</pre>
      </div>
   </div>
</template>

<style lang="css" scoped>
.code :deep(.shiki) {
   background: transparent !important;
}

.code * {
   font-family: 'FiraCode Nerd Font Mono', 'monospace' !important;
   font-variant-ligatures: none !important;
}
</style>
