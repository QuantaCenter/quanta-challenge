<script setup lang="ts">
import type { TMarkdownBlock } from '~/utils/markdown-playground';

const props = defineProps<{
   html?: string;
   /** 传入时按片段渲染，演练块会变成真实组件 */
   blocks?: TMarkdownBlock[];
}>();

function onContentClick(e: MouseEvent) {
   const target = e.target as HTMLElement;
   if (target.tagName !== 'IMG') return;
   const img = target as HTMLImageElement;
   const src = img.currentSrc || img.src;
   if (!src) return;
   e.preventDefault();
   e.stopPropagation();
   globalImage.open(src, { source: img, alt: img.alt || '' });
}
</script>

<template>
   <div class="markdown-body" @click.capture="onContentClick">
      <template v-if="props.blocks?.length">
         <template
            v-for="(block, index) in props.blocks"
            :key="
               block.kind === 'playground'
                  ? `pg-${index}-${block.spec.signature}`
                  : `md-${index}`
            ">
            <div v-if="block.kind === 'html'" v-html="block.html" />
            <StCodePlayground v-else :spec="block.spec" />
         </template>
      </template>
      <div v-else v-html="props.html" />
   </div>
</template>

<style src="./style.css" />
