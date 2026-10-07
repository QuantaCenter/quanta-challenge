<script setup lang="ts">
const props = defineProps<{
   data: number[];
}>();

const width = ref(0);
const height = ref(0);

const container = useTemplateRef('container');
const updateContainerSize = () => {
   if (container.value) {
      const rect = container.value.$el.getBoundingClientRect();
      width.value = rect.width;
      height.value = rect.height;
   }
};
onMounted(() => {
   updateContainerSize();
   if (container.value) {
      const resizeObserver = new ResizeObserver(() => {
         updateContainerSize();
      });
      resizeObserver.observe(container.value.$el);
      onUnmounted(() => {
         resizeObserver.disconnect();
      });
   }
});

const path = computed(() => {
   if (props.data.length === 0) return '';

   const maxData = Math.max(...props.data);
   const minData = Math.min(...props.data);
   const range = maxData - minData || 1; // 防止除以零

   const stepX = width.value / (props.data.length - 1);
   const points = props.data.map((value, index) => {
      const x = index * stepX;
      const y = height.value - (((value - minData) / range) * 0.8 + 0.1) * height.value;
      return `${x},${y}`;
   });

   return points.join(' ');
});

const length = computed(() => {
   const result = path.value.split(' ').reduce(
      (acc, point) => {
         const [x, y] = point.split(',').map(Number) as [number, number];
         if (isNaN(x) || isNaN(y)) return acc;
         if (acc.lastX === null || acc.lastY === null) {
            acc.lastX = x;
            acc.lastY = y;
            return acc;
         }
         const dx = x - acc.lastX;
         const dy = y - acc.lastY;
         acc.total += Math.sqrt(dx * dx + dy * dy);
         acc.lastX = x;
         acc.lastY = y;
         return acc;
      },
      { total: 0, lastX: null as number | null, lastY: null as number | null }
   ).total;
   return result;
});
</script>

<template>
   <StSpace fill-x ref="container">
      <svg :viewBox="`0 0 ${width} ${height}`" class="w-full transition-all">
         <polyline
            :points="path"
            :style="{ '--stroke-length': length }"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round" />
      </svg>
   </StSpace>
</template>

<style scoped>
polyline {
   stroke-dasharray: var(--stroke-length);
   stroke-dashoffset: var(--stroke-length);
   animation: draw 1s ease-in-out forwards;
}

@keyframes draw {
   to {
      stroke-dashoffset: 0;
   }
}
</style>
