<script setup lang="ts">
const props = defineProps<{
   rank: {
      from: number;
      to: number;
      count: number;
   }[];
   currentScore?: number;
}>();

const rank = ref<{ from: number; to: number; count: number }[]>([]);
watch(
   () => props.rank,
   (newVal) => {
      if (newVal.length) {
         if (!rank.value.length) {
            rank.value = newVal.map((item) => ({ ...item, count: 0 }));
         }
         setTimeout(() => {
            rank.value = newVal;
         }, 200);
      }
   },
   { immediate: true }
);

const currentIntervalIdx = computed(() => {
   if (props.currentScore === undefined) return -1;
   return props.rank.findLastIndex(
      (item) =>
         props.currentScore! >= item.from && props.currentScore! <= item.to
   );
});

const maxCount = computed(() => {
   if (props.rank.length === 0) return 1;
   return Math.max(...props.rank.map((item) => item.count));
});

const xAxisLabels = computed(() => {
   // 没有区间数据时不要算坐标轴：`Math.min()` 对空数组返回 Infinity，
   // `max - min` 会得到 NaN，页面上就会出现一个孤零零的 "NaN"。
   if (props.rank.length === 0) return [];
   const minScore = Math.min(...props.rank.map((item) => item.from));
   const maxScore = Math.max(...props.rank.map((item) => item.to));
   const delta = maxScore - minScore;
   const count = props.rank.length / 2;
   const labels: number[] = [];
   for (let i = 0; i <= count; i++) {
      labels.push(Math.round((delta / count) * i) + minScore);
   }
   const result = Array.from(new Set(labels));
   return result;
});
</script>

<template>
   <StSpace direction="vertical" fill gap="0.5rem" class="pt-6">
      <!-- 还没有排行数据（例如刚提交、缓存待载入）就给一句人话，不要画空图 -->
      <StSpace
         v-if="rank.length === 0"
         fill
         center
         class="st-font-tooltip text-accent-400">
         暂无排行数据
      </StSpace>

      <StSpace v-else gap=".25rem" fill class="flex-1" align="end">
         <div
            v-for="(item, idx) in rank"
            :style="{ height: `${(item.count / maxCount) * 100 + 5}%` }"
            :key="idx"
            :class="[
               currentIntervalIdx === idx ? 'bg-primary' : 'bg-secondary',
            ]"
            class="w-full rounded-sm transition-all duration-500 ease-out relative">
            <svg
               v-if="currentIntervalIdx === idx"
               xmlns="http://www.w3.org/2000/svg"
               width="16"
               height="13"
               viewBox="0 0 16 13"
               fill="none"
               class="absolute -top-5 left-1/2 -translate-x-1/2 scale-x-125">
               <path
                  d="M9.73205 12C8.96225 13.3333 7.03775 13.3333 6.26795 12L1.0718 3C0.301997 1.66667 1.26425 4.44263e-07 2.80385 5.78859e-07L13.1962 1.48738e-06C14.7358 1.62198e-06 15.698 1.66667 14.9282 3L9.73205 12Z"
                  fill="#FA7C0E" />
            </svg>
         </div>
      </StSpace>
      <StSpace v-if="rank.length > 0" fill-x gap="0">
         <span
            v-for="(label, idx) in xAxisLabels"
            :key="idx"
            class="text-[0.625rem] text-center w-full font-bold text-accent-300 font-family-manrope">
            {{ label }}
         </span>
      </StSpace>
   </StSpace>
</template>
