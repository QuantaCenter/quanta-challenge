<script setup lang="ts">
import { Trophy } from '@icon-park/vue-next';

defineProps<{
   isListed?: boolean;
}>();

const { $trpc } = useNuxtApp();

const { data: myRank, pending: loadingMyRank } = useAsyncData('ranking', () =>
   $trpc.protected.rank.getMyGlobalRank.query()
);
const diplayedRank = computed(() => (myRank.value === -1 ? '0' : myRank.value));
</script>

<template>
   <StSpace
      direction="vertical"
      justify="center"
      class="p-4 bg-accent-600 rounded-xl w-full md:w-[18.875rem]"
      gap="0.625rem">
      <StSpace fill-x justify="between">
         <StSkeletonItem
            v-if="loadingMyRank"
            class="w-[5.375rem] h-[1.3125rem] rounded-md" />
         <h2 v-else class="st-font-body-normal">当前排名</h2>

         <StSkeletonItem
            v-if="loadingMyRank"
            class="w-[3.625rem] h-[1.3125rem] rounded-md" />
         <StSpace
            v-else
            class="text-accent-700 py-1 px-[0.375rem] rounded-md bg-warning"
            align="center"
            gap="0.25rem">
            <Trophy size="0.75rem" :stroke-width="4" />
            <div class="text-accent-700 text-[0.625rem]">
               {{ isListed ? '已上榜' : '未上榜' }}
            </div>
         </StSpace>
      </StSpace>

      <StSkeletonItem
         v-if="loadingMyRank"
         class="w-full h-[5.5rem] rounded-md" />
      <StSpace
         v-else
         fill-x
         center
         class="h-[5.5rem] text-[4rem] text-primary font-family-manrope font-bold leading-[90%]">
         {{ diplayedRank }}
      </StSpace>

      <StSkeletonItem
         v-if="loadingMyRank"
         class="w-[8.625rem] h-[1.3125rem] rounded-md" />
      <StSpace v-else class="st-font-caption text-accent-300">
         排行榜将在每日 0 点刷新
      </StSpace>
   </StSpace>
</template>
