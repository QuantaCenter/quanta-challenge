<script setup lang="ts">
import { useMessage } from '~/components/st/Message/use-message';

/** 文章正文（Markdown 已渲染成 HTML）：只负责排版，不参与解析。 */
defineProps<{ html?: string }>();

const message = useMessage();
const resetTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

// 正文是 v-html 注入的，复制按钮用事件委托接
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
   <div v-html="html" class="article-body st-selectable" @click="onCopy" />
</template>

<style src="./article-body.css" />
