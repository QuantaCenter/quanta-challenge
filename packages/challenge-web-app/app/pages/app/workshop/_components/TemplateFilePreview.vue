<script setup lang="ts">
import langVue from 'shiki/langs/vue.mjs';
import langTsx from 'shiki/langs/tsx.mjs';
import langJsx from 'shiki/langs/jsx.mjs';
import langHtml from 'shiki/langs/html.mjs';
import langCss from 'shiki/langs/css.mjs';
import langJson from 'shiki/langs/json.mjs';
import langMarkdown from 'shiki/langs/markdown.mjs';
import { useShiki } from '~/composables/use-shiki';

/** 模板结构里的只读代码预览 */
const props = defineProps<{ path: string; code: string }>();

const LANG_BY_EXT: Record<string, string> = {
   vue: 'vue',
   ts: 'tsx',
   tsx: 'tsx',
   js: 'jsx',
   mjs: 'jsx',
   cjs: 'jsx',
   jsx: 'jsx',
   html: 'html',
   css: 'css',
   json: 'json',
   md: 'markdown',
};

const lang = computed(
   () => LANG_BY_EXT[props.path.split('.').pop()?.toLowerCase() ?? ''] ?? 'text',
);

const { highlightCode, highlightHtml, hasReady } = useShiki({
   languages: [langVue, langTsx, langJsx, langHtml, langCss, langJson, langMarkdown],
});

const render = () => {
   try {
      void highlightCode(props.code, lang.value as never);
   } catch (error) {
      console.warn('[workshop] 代码高亮失败，改为纯文本展示:', error);
      highlightHtml.value = '';
   }
};
watch(() => [props.path, props.code, hasReady.value], render, { immediate: true });
</script>

<template>
   <div class="template-file-preview font-family-fira-code text-[0.8125rem] leading-6">
      <div v-if="highlightHtml" v-html="highlightHtml" />
      <pre v-else class="p-4 text-accent-200 whitespace-pre">{{ code }}</pre>
   </div>
</template>

<style scoped>
.template-file-preview :deep(pre) {
   margin: 0;
   padding: 1rem;
   background: transparent !important;
   white-space: pre;
}
</style>
