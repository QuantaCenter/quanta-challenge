<script setup lang="ts">
import { useMessage } from '~/components/st/Message/use-message';

/** 文章正文（Markdown 已渲染成 HTML）：只负责排版，不参与解析。 */
defineProps<{ html?: string; dense?: boolean }>();

const message = useMessage();
const resetTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

const onImageClick = (event: MouseEvent) => {
   const target = event.target as HTMLElement;
   if (target.tagName !== 'IMG') return;
   const img = target as HTMLImageElement;
   const src = img.currentSrc || img.src;
   if (!src) return;
   event.preventDefault();
   event.stopPropagation();
   globalImage.open(src, { source: img, alt: img.alt || '' });
};

const onContentClick = (event: MouseEvent) => {
   onImageClick(event);
   void onCopy(event);
};

const onCopy = async (event: MouseEvent) => {
   const button = (event.target as Element | null)?.closest<HTMLElement>(
      '.article-code__copy',
   );
   if (!button) return;

   const code =
      button.closest('.article-code')?.querySelector('code')?.textContent ?? '';

   try {
      await navigator.clipboard.writeText(code);
   } catch {
      message.error('复制失败');
      return;
   }

   message.success('已复制');
   button.classList.add('is-copied');
   const timer = resetTimers.get(button);
   if (timer) clearTimeout(timer);
   resetTimers.set(
      button,
      setTimeout(() => button.classList.remove('is-copied'), 1600),
   );
};
</script>

<template>
   <div
      v-html="html"
      class="article-body st-selectable"
      :class="{ 'article-body--dense': dense }"
      @click="onContentClick" />
</template>

<style src="./article-body.css" />
