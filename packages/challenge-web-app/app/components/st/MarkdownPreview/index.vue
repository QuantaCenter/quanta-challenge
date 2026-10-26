<script setup lang="ts">
const props = defineProps<{
   html?: string;
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
   <div
      v-html="props.html"
      class="markdown-body"
      @click.capture="onContentClick"
   />
</template>

<style src="./style.css" />
