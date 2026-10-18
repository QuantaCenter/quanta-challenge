<script setup lang="ts">
import AchievementContainer from './_components/AchievementContainer.vue';
import AchievementHeader from './_components/AchievementHeader.vue';
import AchievementProgress from './_components/AchievementProgress.vue';
import AchievementListSkeleton from './_skeletons/AchievementListSkeleton.vue';
import AchievementInfoCard from './_components/AchievementInfoCard.vue';

useSeoMeta({ title: '成就 - Quanta Challenge' });

const { $trpc } = useNuxtApp();
const { data, pending } = useAsyncData('getUserAchievementsWall', () =>
   $trpc.protected.achievement.getUserAchievementsWall.query()
);

const isEmpty = computed(() => {
   const achievedCount = data.value?.achieved.length ?? 0;
   const inProgressCount = data.value?.inProgress.length ?? 0;
   const lockedCount = data.value?.locked.length ?? 0;
   return achievedCount + inProgressCount + lockedCount === 0;
});

const statusToText: Record<'achieved' | 'inProgress' | 'locked', string> = {
   achieved: '已获得',
   inProgress: '进行中',
   locked: '未解锁',
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-full md:w-[44rem] px-4 md:px-0 pb-[2rem] my-6">
         <h1 class="st-font-hero-bold">成就</h1>

         <AchievementInfoCard />

         <AchievementListSkeleton v-if="pending" />
         <StEmptyStatus
            v-else-if="isEmpty"
            content="暂无成就"
            class="!w-full md:!w-[44rem] mt-[10rem]" />
         <StSpace v-else fill-x direction="vertical" class="py-[0.875rem]">
            <StSpace
               v-for="(item, name) in data"
               :key="name"
               v-show="item.length"
               fill-x
               direction="vertical"
               gap="0.75rem">
               <h2 class="st-font-body-bold">
                  {{ statusToText[name] }}
               </h2>
               <AchievementContainer
                  v-for="achievement in item"
                  :key="achievement.id"
                  :imageUrl="achievement.badgeUrl"
                  :locked="name === 'locked'"
                  :grayscale="name === 'inProgress'">
                  <AchievementHeader
                     :title="achievement.name"
                     :achivedAt="achievement.achievedAt"
                     :score="achievement.score" />
                  <div class="st-font-body-normal text-accent-100">
                     {{
                        name === 'locked' ? '？？？' : achievement.description
                     }}
                  </div>
                  <AchievementProgress
                     v-if="name === 'inProgress'"
                     :progress="(achievement.progress * 100).toFixed(0)" />
               </AchievementContainer>
            </StSpace>
         </StSpace>
      </StSpace>
   </StSpace>
</template>
