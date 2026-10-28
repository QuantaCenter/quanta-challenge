<script setup lang="ts">
import { Left, Right } from '@icon-park/vue-next';

const scrollContainer = useTemplateRef('scrollContainer');
const scrollEl = computed(
   () => (scrollContainer.value?.$el as HTMLElement | undefined) ?? null,
);
const { arrivedState } = useScroll(scrollEl, { behavior: 'smooth' });
const isOverflow = ref(false);

const checkOverflow = () => {
   if (!scrollEl.value) return;
   isOverflow.value = scrollEl.value.scrollWidth > scrollEl.value.clientWidth + 1;
};

useResizeObserver(scrollEl, checkOverflow);
onMounted(() => nextTick(checkOverflow));

const scrollBy = (delta: number) =>
   scrollEl.value?.scrollBy({ left: delta, behavior: 'smooth' });
</script>

<template>
   <div class="relative w-full">
      <div
         class="absolute bottom-0 left-0 top-0 z-10 flex items-center justify-center bg-gradient-to-r from-background to-transparent pl-1 pr-6 transition-opacity duration-300"
         :class="isOverflow && !arrivedState.left ? 'opacity-100' : 'pointer-events-none opacity-0'">
         <button
            type="button"
            title="向左滚动"
            aria-label="向左滚动"
            class="flex size-8 cursor-pointer items-center justify-center rounded-full bg-accent-500 transition-colors hover:bg-accent-400"
            @click="scrollBy(-360)">
            <Left size="16" fill="#fff" />
         </button>
      </div>

      <StScrollable ref="scrollContainer" scroll-x fill class="cover-rail relative">
         <StSpace gap="1rem" class="w-max pb-1"><slot /></StSpace>
      </StScrollable>

      <div
         class="absolute bottom-0 right-0 top-0 z-10 flex items-center justify-center bg-gradient-to-l from-background to-transparent pl-6 pr-1 transition-opacity duration-300"
         :class="isOverflow && !arrivedState.right ? 'opacity-100' : 'pointer-events-none opacity-0'">
         <button
            type="button"
            title="向右滚动"
            aria-label="向右滚动"
            class="flex size-8 cursor-pointer items-center justify-center rounded-full bg-accent-500 transition-colors hover:bg-accent-400"
            @click="scrollBy(360)">
            <Right size="16" fill="#fff" />
         </button>
      </div>
   </div>
</template>

<style scoped>
.cover-rail {
   scrollbar-width: none;
   -ms-overflow-style: none;
}
.cover-rail::-webkit-scrollbar {
   display: none;
}
</style>
