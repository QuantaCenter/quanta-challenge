<script setup lang="ts">
import { TrendingDown, TrendingUp } from '@icon-park/vue-next';

const { $trpc } = useNuxtApp();

const { data: trendData, pending } = useAsyncData(
   'getMyRankingTrends',
   () => $trpc.protected.rank.getMyRankingTrends.query()
);

// 名次上升量占榜单总人数的比例（-1 ~ 1 的小数），与仪表盘口径一致。
const increaseRatio = computed(() => {
   const data = trendData.value;
   if (!data || data.trends.length < 2 || data.total <= 0) return 0;
   const [lastRank, currRank] = data.trends.slice(-2) as [number, number];
   return (lastRank - currRank) / data.total;
});

const increaseRatioText = computed(() => {
   const ratio = (increaseRatio.value * 100).toFixed(2) + '%';
   return increaseRatio.value >= 0 ? `+${ratio}` : ratio;
});
</script>

<template>
   <StSpace
      direction="vertical"
      justify="center"
      class="p-4 bg-accent-600 rounded-xl w-[18.875rem]"
      gap="0.625rem">
      <StSpace fill-x justify="between">
         <StSkeletonItem
            v-if="pending"
            class="w-[5.375rem] h-[1.3125rem] rounded-md" />
         <div v-else class="st-font-body-normal">排名变化</div>

         <StSkeletonItem
            v-if="pending"
            class="w-[3.625rem] h-[1.3125rem] rounded-md" />
         <StSpace
            v-else
            gap="0.25rem"
            align="center"
            class="py-1 px-[0.375rem] rounded-[0.375rem]"
            :class="
               increaseRatio >= 0
                  ? 'bg-secondary text-accent-600'
                  : 'bg-primary text-white'
            ">
            <TrendingUp
               v-if="increaseRatio >= 0"
               class="text-accent-700"
               size="1rem" />
            <TrendingDown v-else size="1rem" />
            <div
               class="text-[0.625rem] leading-[100%] font-bold font-family-manrope">
               {{ increaseRatioText }}
            </div>
         </StSpace>
      </StSpace>

      <StSkeletonItem v-if="pending" class="w-full h-[7rem] rounded-md" />
      <StSpace v-else fill-x class="flex-1" align="center">
         <StLineChart
            v-if="!pending"
            :data="trendData?.trends ?? []"
            :class="[
               'h-16 my-6',
               increaseRatio >= 0 ? 'text-secondary' : 'text-primary',
            ]" />
         <div v-else>Loading...</div>
      </StSpace>
   </StSpace>
</template>
