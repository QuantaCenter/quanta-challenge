<script setup lang="ts">
import { Left, Right } from '@icon-park/vue-next';

/**
 * 左右滚动的卡片栏（学习首页的专题栏、课程详情页的专题栏都用它）。
 * 交互沿用题库页那套：隐藏原生滚动条 + 两端渐隐遮罩 + 圆形箭头按钮。
 */
const scrollContainer = useTemplateRef('scrollContainer');
const scrollEl = computed(
   () => (scrollContainer.value?.$el as HTMLElement) ?? null,
);
const { arrivedState } = useScroll(scrollEl, { behavior: 'smooth' });

const isOverflow = ref(false);
const checkOverflow = () => {
   if (!scrollEl.value) return;
   const { scrollWidth, clientWidth } = scrollEl.value;
   isOverflow.value = scrollWidth > clientWidth + 1;
};
useResizeObserver(scrollEl, checkOverflow);
onMounted(() => nextTick(checkOverflow));

const scrollBy = (delta: number) => {
   scrollEl.value?.scrollBy({ left: delta, behavior: 'smooth' });
};
</script>

<template>
   <div class="relative w-full">
      <div
         class="absolute left-0 top-0 bottom-0 z-10 flex items-center justify-center bg-gradient-to-r from-background to-transparent pr-6 pl-1 transition-opacity duration-300"
         :class="
            isOverflow && !arrivedState.left
               ? 'opacity-100'
               : 'opacity-0 pointer-events-none'
         ">
         <button
            type="button"
            title="向左滚动"
            aria-label="向左滚动"
            class="w-8 h-8 rounded-full bg-accent-500 flex items-center justify-center hover:bg-accent-400 transition-colors cursor-pointer"
            @click="scrollBy(-360)">
            <Left theme="outline" size="16" fill="#fff" />
         </button>
      </div>

      <StScrollable
         ref="scrollContainer"
         scroll-x
         fill
         class="cover-rail relative">
         <StSpace gap="1rem" class="pb-1 w-max">
            <slot></slot>
         </StSpace>
      </StScrollable>

      <div
         class="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center bg-gradient-to-l from-background to-transparent pl-6 pr-1 transition-opacity duration-300"
         :class="
            isOverflow && !arrivedState.right
               ? 'opacity-100'
               : 'opacity-0 pointer-events-none'
         ">
         <button
            type="button"
            title="向右滚动"
            aria-label="向右滚动"
            class="w-8 h-8 rounded-full bg-accent-500 flex items-center justify-center hover:bg-accent-400 transition-colors cursor-pointer"
            @click="scrollBy(360)">
            <Right theme="outline" size="16" fill="#fff" />
         </button>
      </div>
   </div>
</template>

<style scoped>
/* 隐藏原生滚动条（utils.css 的 .hide-scrollbar 是页面级 scoped，管不到组件内部） */
.cover-rail {
   scrollbar-width: none;
   -ms-overflow-style: none;
}

.cover-rail::-webkit-scrollbar {
   display: none;
   width: 0;
   height: 0;
}
</style>
