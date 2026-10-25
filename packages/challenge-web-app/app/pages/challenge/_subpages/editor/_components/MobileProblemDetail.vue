<script setup lang="ts">
import { useMarkdown } from '~/composables/use-markdown';
import ProblemDetailSkeleton from '../_skeletons/ProblemDetailSkeleton.vue';

const props = defineProps<{
   markdown?: string;
}>();

// 与 DetailWindow 相同的 markdown 处理管线
const { html: rawHtml, update } = useMarkdown();

// 本组件在桌面端被外层板块 CSS 隐藏（桌面题面走 DetailWindow），桌面宽度下跳过解析
const isDesktopWidth = () =>
   typeof window !== 'undefined' &&
   window.matchMedia('(min-width: 768px)').matches;

onMounted(() => {
   if (isDesktopWidth()) return;
   props.markdown && update(props.markdown);
});
watch(
   () => props.markdown,
   (newMarkdown) => {
      if (isDesktopWidth()) return;
      newMarkdown && update(newMarkdown);
   },
);

/**
 * 剥掉题面 markdown 中的裸 <style> 标签，避免其经 v-html 注入后
 * 全局生效影响页面布局。
 */
const html = computed(() =>
   rawHtml.value.replace(/<style[\s\S]*?<\/style>/gi, ''),
);

/**
 * 骨架屏以覆盖层形式保留，等懒加载的预览组件真正挂载后才移除。
 */
const previewReady = ref(false);
</script>

<template>
   <div class="absolute inset-0 bg-[#1F1F1F] overflow-hidden">
      <ProblemDetailSkeleton
         v-if="!previewReady"
         class="absolute inset-0 overflow-y-auto hide-scrollbar" />
      <div
         class="hide-scrollbar h-full overflow-y-auto overscroll-y-contain overflow-x-hidden p-3 pt-0 text-[13px] text-accent-100">
         <LazyStMarkdownPreview
            v-if="html"
            :html="html"
            class="w-full"
            @vue:mounted="previewReady = true" />
      </div>
   </div>
</template>
