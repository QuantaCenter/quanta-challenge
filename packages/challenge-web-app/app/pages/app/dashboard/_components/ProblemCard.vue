<script setup lang="ts">
import type { DailyProblem } from '../_modules/DailyChallengeCard.vue';

defineProps<{
   problem: DailyProblem;
}>();

const difficultyTextMap = {
   easy: '简单',
   medium: '中等',
   hard: '困难',
   very_hard: '非常困难',
} as const;
</script>

<template>
   <StProblemCard
      :cover-image-name="problem.coverImageName"
      :cover-image-thumbhash="problem.coverImageThumbhash"
      :cover-image-thumbhash-url="problem.coverImageThumbhashUrl"
      class="!bg-accent-500">
      <StSpace
         direction="vertical"
         justify="between"
         gap="1rem"
         class="w-full h-full mb-3 px-2">
         <StProblemCardTitle :title="problem.title" />
         <StProblemCardTags :tags="problem.tags" />
         <StProblemCardDivider />
         <StProblemCardInfo>
            <StProblemCardInfoItem title="通过率">
               <span
                  class="font-family-manrope text-white leading-[90%] font-bold">
                  {{ (problem.passRate * 100).toFixed(2) }}%
               </span>
            </StProblemCardInfoItem>
            <StProblemCardInfoItem title="通过得分">
               <span
                  class="font-family-manrope text-white leading-[90%] font-bold">
                  {{ problem.totalScore }}
               </span>
            </StProblemCardInfoItem>
            <StProblemCardInfoItem title="题目难度">
               <span class="text-white leading-[90%] font-bold">
                  {{ difficultyTextMap[problem.difficulty] }}
               </span>
            </StProblemCardInfoItem>
         </StProblemCardInfo>
      </StSpace>
   </StProblemCard>
</template>
