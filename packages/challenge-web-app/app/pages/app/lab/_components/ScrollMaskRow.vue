<script setup lang="ts">
import { Left, Right } from '@icon-park/vue-next';
import { useResizeObserver, useScroll } from '@vueuse/core';

/**
 * 横向滚动行：内容溢出时在两端显示渐变遮罩与翻页按钮（与题目页的标签栏表现一致）。
 * 移动端靠触摸滑动，不显示按钮，遮罩仍保留。
 */

const scrollEl = ref<HTMLElement | null>(null);
const contentEl = ref<HTMLElement | null>(null);
const { arrivedState } = useScroll(scrollEl, { behavior: 'smooth' });

const isOverflow = ref(false);
const checkOverflow = () => {
   if (!scrollEl.value) return;
   const { scrollWidth, clientWidth } = scrollEl.value;
   isOverflow.value = scrollWidth > clientWidth + 1;
};
// 容器宽度变化与内容宽度变化都要重新判断是否溢出
useResizeObserver([scrollEl, contentEl], checkOverflow);
onMounted(checkOverflow);

const showLeft = computed(() => isOverflow.value && !arrivedState.left);
const showRight = computed(() => isOverflow.value && !arrivedState.right);

const scrollBy = (left: number) => {
   scrollEl.value?.scrollBy({ left, behavior: 'smooth' });
};
</script>

<template>
   <div class="relative min-w-0 h-[3.5rem]">
      <div
         class="absolute left-0 top-0 bottom-0 z-10 flex items-center justify-center bg-gradient-to-r from-background to-transparent pr-4 pl-1 transition-opacity duration-300"
         :class="showLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'">
         <button
            type="button"
            aria-label="向左滚动"
            class="w-8 h-8 rounded-full bg-[#2C2C2C] flex items-center justify-center hover:bg-[#3C3C3C] transition-colors cursor-pointer max-md:hidden"
            @click="scrollBy(-200)">
            <Left theme="outline" size="16" fill="#fff" />
         </button>
      </div>

      <div ref="scrollEl" class="h-full overflow-x-auto hide-scrollbar">
         <div ref="contentEl" class="w-max">
            <slot />
         </div>
      </div>

      <div
         class="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center bg-gradient-to-l from-background to-transparent pl-4 pr-1 transition-opacity duration-300"
         :class="showRight ? 'opacity-100' : 'opacity-0 pointer-events-none'">
         <button
            type="button"
            aria-label="向右滚动"
            class="w-8 h-8 rounded-full bg-[#2C2C2C] flex items-center justify-center hover:bg-[#3C3C3C] transition-colors cursor-pointer max-md:hidden"
            @click="scrollBy(200)">
            <Right theme="outline" size="16" fill="#fff" />
         </button>
      </div>
   </div>
</template>

<style scoped src="@/assets/css/utils.css" />
