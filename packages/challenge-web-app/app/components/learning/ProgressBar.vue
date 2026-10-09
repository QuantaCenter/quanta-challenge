<script setup lang="ts">
import { Check } from '@icon-park/vue-next';

const props = defineProps<{
   progress: number;
   percent: number;
   completed: boolean;
   isReadingOnly: boolean;
   read: boolean;
}>();

const isFull = computed(() => props.percent >= 100);
const showMosaic = computed(() => props.percent >= 10 && !isFull.value);
</script>

<template>
   <div
      v-if="props.isReadingOnly"
      class="h-[1.75rem] flex-1 min-w-0 flex items-center justify-center rounded-full st-font-tooltip transition-colors"
      :class="
         props.read
            ? 'bg-secondary/20 text-secondary'
            : 'bg-accent-500/70 text-accent-200'
      ">
      <Check v-if="props.read" size="0.75rem" :strokeWidth="3" />
      <span class="ml-1">{{ props.read ? '已读' : '未读' }}</span>
   </div>

   <div v-else class="flex-1 min-w-0 flex items-center gap-2">
      <div
         class="w-[2.5rem] shrink-0 h-[1.75rem] flex items-center justify-center rounded-full bg-secondary text-accent-700 st-font-tooltip font-bold font-family-manrope">
         {{ props.percent }}%
      </div>

      <div
         class="relative flex-1 min-w-0 h-[1.75rem] rounded-full bg-accent-400/50 overflow-hidden">
         <div
            class="absolute inset-y-0 left-0 transition-[width] duration-500"
            :class="[
               isFull ? 'rounded-full' : 'rounded-l-full',
               showMosaic ? 'learning-bar-fill' : 'learning-bar-fill-plain',
            ]"
            :style="{ width: `${props.percent}%` }" />

         <span
            v-if="showMosaic"
            class="learning-bar-mosaic absolute inset-y-0 w-[0.35rem]"
            :style="{ left: `${props.percent}%` }" />
      </div>
   </div>
</template>

<style scoped>
.learning-bar-fill,
.learning-bar-mosaic {
   --bar-color: var(--color-secondary, #a6fb1d);
}

.learning-bar-fill-plain {
   background-color: var(--color-secondary, #a6fb1d);
}

/* 整条必须完全由渐变画出：用 background-color 会让留空的格子透出实心色，挖空失效 */
.learning-bar-fill {
   background-image:
      linear-gradient(
         to right,
         var(--bar-color) 0 calc(100% - 0.35rem),
         transparent calc(100% - 0.35rem)
      ),
      linear-gradient(
         to bottom,
         var(--bar-color) 0 20%,
         transparent 20% 40%,
         var(--bar-color) 40% 60%,
         transparent 60% 80%,
         var(--bar-color) 80% 100%
      );
   background-size:
      100% 100%,
      0.35rem 100%;
   background-position:
      left top,
      right top;
   background-repeat: no-repeat;
}

.learning-bar-mosaic {
   background-image: linear-gradient(
      to bottom,
      transparent 0 20%,
      var(--bar-color) 20% 40%,
      transparent 40% 60%,
      var(--bar-color) 60% 80%,
      transparent 80% 100%
   );
}
</style>
