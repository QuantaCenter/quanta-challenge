<script setup lang="ts">
import { Down } from '@icon-park/vue-next';
import useAuthStore from '~/stores/auth-store';
import SubmissionStatusCard from '../_modules/SubmissionStatusCard.vue';
import AchievementsCard from '../_modules/AchievementsCard.vue';
import RecentLearningCard from '../_modules/RecentLearningCard.vue';
import MobileDailyCard from './DailyCard.vue';
import MobileSubmissionCard from './SubmissionCard.vue';
import RankingCard from '../_modules/RankingCard.vue';

const authStore = useAuthStore();

const username = computed(
   () => authStore.user?.displayName || authStore.user?.name || '用户'
);

const greeting = ref('你好');

onMounted(() => {
   const hour = new Date().getHours();
   if (hour >= 5 && hour < 12) greeting.value = '早上好';
   else if (hour >= 12 && hour < 18) greeting.value = '下午好';
   else greeting.value = '晚上好';
});

const heatmapExpanded = ref(false);
</script>

<template>
   <div class="px-4 pt-4 pb-6">
      <button
         class="w-full flex items-center justify-between text-left"
         @click="heatmapExpanded = !heatmapExpanded">
         <h1 class="st-font-third-bold">
            {{ greeting }}，{{ username }}
         </h1>
         <Down
            class="text-accent-300 text-[1.125rem] transition-transform duration-200"
            :class="heatmapExpanded ? 'rotate-180' : ''" />
      </button>

      <div
         class="mt-3 grid transition-[grid-template-rows] duration-300 ease-in-out"
         :class="heatmapExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'">
         <div class="overflow-hidden min-h-0">
            <SubmissionStatusCard status="personal-space" class="!mt-0" />
         </div>
      </div>

      <MobileDailyCard class="mt-4" />

      <MobileSubmissionCard class="mt-4 !h-auto" />

      <div class="mt-4 h-[12rem]">
         <RecentLearningCard />
      </div>

      <div class="mt-4 h-[16rem]">
         <AchievementsCard :show-link="false" />
      </div>

      <div class="mt-4 h-[36rem]">
         <RankingCard />
      </div>
   </div>
</template>
