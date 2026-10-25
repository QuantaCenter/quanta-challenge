<script setup lang="ts">
import { useMarkdown } from '~/composables/use-markdown';
import ProblemDetailSkeleton from '../_skeletons/ProblemDetailSkeleton.vue';

const props = defineProps<{
   markdown?: string;
}>();

// 与 DetailWindow 相同的 markdown 处理管线
const { html: rawHtml, update } = useMarkdown();

// 本组件在桌面端被外层板块 CSS 隐藏（桌面题面走 DetailWindow），
// 桌面宽度下跳过解析，避免无用的 markdown / 高亮开销
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
 * 题面 markdown 常带裸 <style> 标签，v-html 注入后会全局生效，
 * 可能改写 body/html 的高度或 overflow，把整个页面（含抽屉）撑得高过屏幕。
 * 移动端题面面板直接剥掉 <style>/<script>，只保留内容本身。
 */
const html = computed(() =>
   rawHtml.value.replace(/<style[\s\S]*?<\/style>/gi, ''),
);

/**
 * 骨架屏撤除时机：不能在 html 就绪时就撤——LazyStMarkdownPreview 是懒加载
 * 组件，chunk 加载完成前会有一段空白。骨架以覆盖层形式保留，等预览组件
 * 真正挂载后才移除，避免中间闪黑。
 */
const previewReady = ref(false);
</script>

<template>
   <!-- 移动端做题页的题面面板：绝对定位钉死在板块内（不随内容增长），
        高度恒等于板块高度，内容只在内部滚动 -->
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
