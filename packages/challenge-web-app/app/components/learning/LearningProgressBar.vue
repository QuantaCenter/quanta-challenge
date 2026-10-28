<script setup lang="ts">
const props = defineProps<{
   percent: number;
}>();

const normalized = computed(() =>
   Math.min(100, Math.max(0, Math.round(props.percent))),
);
const isFull = computed(() => normalized.value >= 100);
const showMosaic = computed(() => normalized.value >= 10 && !isFull.value);
</script>

<template>
   <div class="flex min-w-0 flex-1 items-center gap-2">
      <div
         class="flex h-[1.25rem] w-[2.5rem] shrink-0 items-center justify-center rounded-full bg-secondary font-family-manrope st-font-tooltip font-bold text-accent-700">
         {{ normalized }}%
      </div>
      <div class="relative h-[1.25rem] min-w-0 flex-1 overflow-hidden rounded-full bg-accent-400/50">
         <div
            class="absolute inset-y-0 left-0 transition-[width] duration-500"
            :class="[
               isFull ? 'rounded-full' : 'rounded-l-full',
               showMosaic ? 'learning-bar-fill' : 'learning-bar-fill-plain',
            ]"
            :style="{ width: `${normalized}%` }" />
         <span
            v-if="showMosaic"
            class="learning-bar-mosaic absolute inset-y-0"
            :style="{ left: `${normalized}%` }" />
      </div>
   </div>
</template>

<style scoped>
.learning-bar-fill,
.learning-bar-mosaic {
   --bar-color: var(--color-secondary, #a6fb1d);
   --mosaic-size: 0.25rem;
}
.learning-bar-fill-plain {
   background-color: var(--color-secondary, #a6fb1d);
}
.learning-bar-fill {
   background-image:
      linear-gradient(to right, var(--bar-color) 0 calc(100% - var(--mosaic-size)), transparent calc(100% - var(--mosaic-size))),
      linear-gradient(to bottom, var(--bar-color) 0 20%, transparent 20% 40%, var(--bar-color) 40% 60%, transparent 60% 80%, var(--bar-color) 80% 100%);
   background-position: left top, right top;
   background-repeat: no-repeat;
   background-size: 100% 100%, var(--mosaic-size) 100%;
}
.learning-bar-mosaic {
   width: var(--mosaic-size);
   background-image: linear-gradient(to bottom, transparent 0 20%, var(--bar-color) 20% 40%, transparent 40% 60%, var(--bar-color) 60% 80%, transparent 80% 100%);
}
</style>
