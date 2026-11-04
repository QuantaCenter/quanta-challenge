<script setup lang="ts">
const props = defineProps<{ percent: number }>();
const percent = computed(() => Math.max(0, Math.min(100, props.percent)));
const showMosaic = computed(() => percent.value >= 10 && percent.value < 100);
</script>

<template>
   <div class="flex min-w-0 flex-1 items-stretch gap-1">
      <span class="st-font-tooltip flex shrink-0 items-center justify-center rounded-full bg-secondary px-2 py-1 text-accent-700">
         {{ percent }}%
      </span>
      <div
         role="progressbar"
         aria-label="课程完成进度"
         :aria-valuenow="percent"
         aria-valuemin="0"
         aria-valuemax="100"
         class="relative min-w-0 flex-1 overflow-hidden rounded-full bg-accent-400/50">
         <div
            class="absolute inset-y-0 left-0 transition-[width] duration-500 motion-reduce:transition-none"
            :class="[percent === 100 ? 'rounded-full' : 'rounded-l-full', showMosaic ? 'learning-bar-fill' : 'bg-secondary']"
            :style="{ width: `${percent}%` }" />
         <span
            v-if="showMosaic"
            class="learning-bar-mosaic absolute inset-y-0"
            :style="{ left: `${percent}%` }" />
      </div>
   </div>
</template>

<style scoped>
.learning-bar-fill,
.learning-bar-mosaic {
   --bar-color: var(--color-secondary, #a6fb1d);
   --mosaic-size: 0.3rem;
}
.learning-bar-fill {
   background-image:
      linear-gradient(to right, var(--bar-color) 0 calc(100% - var(--mosaic-size)), transparent calc(100% - var(--mosaic-size))),
      linear-gradient(to bottom, var(--bar-color) 0 20%, transparent 20% 40%, var(--bar-color) 40% 60%, transparent 60% 80%, var(--bar-color) 80% 100%);
   /* Overlap the solid fill to avoid a subpixel seam at fractional widths. */
   background-size: 100% 100%, calc(var(--mosaic-size) + 1px) 100%;
   background-position: left top, right top;
   background-repeat: no-repeat;
}
.learning-bar-mosaic {
   width: var(--mosaic-size);
   background-image: linear-gradient(to bottom, transparent 0 20%, var(--bar-color) 20% 40%, transparent 40% 60%, var(--bar-color) 60% 80%, transparent 80% 100%);
}
</style>
