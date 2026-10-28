<script setup lang="ts">
const props = withDefaults(
   defineProps<{
      percent: number;
      label?: string;
      compact?: boolean;
   }>(),
   { label: '学习进度', compact: false },
);

const normalized = computed(() =>
   Math.min(100, Math.max(0, Math.round(props.percent))),
);
</script>

<template>
   <div class="w-full">
      <div
         v-if="!compact"
         class="mb-2 flex items-center justify-between text-sm text-accent-300">
         <span>{{ label }}</span>
         <span class="font-family-manrope font-bold text-white">{{ normalized }}%</span>
      </div>
      <div
         class="h-2 w-full overflow-hidden rounded-full bg-accent-700"
         role="progressbar"
         :aria-label="label"
         :aria-valuenow="normalized"
         aria-valuemin="0"
         aria-valuemax="100">
         <div
            class="h-full rounded-full transition-[width] duration-500"
            :class="normalized === 100 ? 'bg-success' : normalized > 0 ? 'bg-secondary' : 'bg-primary'"
            :style="{ width: `${normalized}%` }"></div>
      </div>
   </div>
</template>
