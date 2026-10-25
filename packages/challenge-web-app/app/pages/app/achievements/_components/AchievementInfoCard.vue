<script setup lang="ts">
import { BadgeTwo } from '@icon-park/vue-next';

const { $trpc } = useNuxtApp();

const { data: stats, pending } = useAsyncData('achievement-stats', () =>
   $trpc.protected.achievement.getAchievementStats.query()
);

const positionName = computed(() => {
   if (!stats.value) return '初学者';
   const level = stats.value.level;
   if (level >= 10) return '成就大师';
   if (level >= 7) return '成就专家';
   if (level >= 4) return '成就进阶者';
   return '初学者';
});
</script>

<template>
   <StCard :icon="BadgeTwo" title="成就数据" class="h-full">
      <StSkeleton :loading="pending" class="w-full h-full mt-4">
         <template #loading>
            <StSpace fill align="center" gap="1.5rem">
               <StSkeletonItem
                  class="!size-32 max-md:!size-24 !rounded-full shrink-0" />
               <StSpace direction="vertical" gap="1rem" class="flex-1">
                  <StSkeletonItem class="h-6 w-32" />
                  <StSkeletonItem class="h-4 w-48" />
                  <StSkeletonItem class="h-4 w-full !rounded-full" />
               </StSpace>
            </StSpace>
         </template>

         <StSpace
            v-if="stats"
            fill
            align="center"
            gap="1.75rem"
            class="p-2 pt-4 max-md:gap-4">
            <!-- 等级徽章 -->
            <div class="relative shrink-0">
               <!-- 外圈装饰 -->
               <div
                  class="relative flex items-center justify-center size-32 max-md:size-24">
                  <div
                     class="absolute flex items-center justify-center size-40 max-md:size-[7.5rem]">
                     <img
                        class="absolute text-yellow-500 size-40 max-md:size-[7.5rem] shrink-0"
                        src="~/assets/images/level-bg.webp"
                        alt="level-bg" />
                  </div>
                  <span
                     class="text-5xl max-md:text-3xl font-bold font-family-manrope text-accent-100 text-shadow-lg -translate-y-2.5 translate-x-0.5 select-none mix-blend-overlay">
                     {{ stats.level }}
                  </span>
               </div>
            </div>

            <!-- 右侧信息 -->
            <StSpace direction="vertical" gap="0.5rem" class="flex-1 min-w-0">
               <!-- 成就进度 -->
               <StSpace gap="1rem" align="end">
                  <div
                     class="st-font-body-bold text-transparent bg-clip-text bg-gradient-to-r from-accent-100 via-white to-accent-200">
                     {{ positionName }}
                  </div>
               </StSpace>

               <!-- 成就进度 -->
               <StSpace gap="1rem" align="end">
                  <div
                     class="st-font-body-normal text-accent-200 font-family-manrope">
                     获得成就： {{ stats.achievedCount }} /
                     {{ stats.totalCount }}
                  </div>
               </StSpace>

               <!-- 经验进度条 -->
               <StSpace direction="vertical" gap="0.5rem" fill-x>
                  <StSpace fill-x justify="between" align="end">
                     <div class="st-font-body-normal text-accent-200">
                        当前经验值：
                     </div>
                     <div
                        class="st-font-caption text-accent-200 font-family-manrope">
                        {{ stats.expInCurrentLevel }} /
                        {{ stats.expToNextLevel }}
                     </div>
                  </StSpace>
                  <div
                     class="w-full h-3.5 bg-accent-500 rounded-full overflow-hidden relative">
                     <div
                        class="h-full bg-gradient-to-r from-secondary to-success rounded-l-full transition-all duration-500 relative progress-bar"
                        :style="{ width: `${stats.expProgress * 100}%` }"></div>
                  </div>
               </StSpace>
            </StSpace>
         </StSpace>
      </StSkeleton>
   </StCard>
</template>

<style lang="css" scoped>
.progress-bar::before,
.progress-bar::after {
   content: '';
   position: absolute;
   top: 0;
   width: 4px;
   height: 4px;
   background-color: #14e87e;
   right: -4px;
   filter: drop-shadow(0 0 3px #14e87e);
}

.progress-bar::after {
   top: 8px;
}
</style>
