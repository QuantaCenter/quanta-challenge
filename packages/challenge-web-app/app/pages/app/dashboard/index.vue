<script setup lang="ts">
import useAuthStore from '~/stores/auth-store';
import {
   DailyChallengeCard,
   RecentLearningCard,
   RecentSubmissionCard,
   SubmissionStatusCard,
   AchievementsCard,
   RankingCard,
} from './_modules';

useSeoMeta({ title: '仪表盘 - Quanta Challenge' });

const authStore = useAuthStore();

const username = computed(
   () => authStore.user?.displayName || authStore.user?.name || '用户',
);

// 问候语取决于「用户本地时间」。SSR 此时跑在容器时区，与浏览器本地时区
// 未必一致，服务端直接算会在水合时产生文案跳变/不匹配。这里先用中性文案
// 渲染，挂载后在客户端按真实本地时间计算。
const greeting = ref('你好');

onMounted(() => {
   const hour = new Date().getHours();
   if (hour >= 5 && hour < 12) greeting.value = '☀️ 早上好';
   else if (hour >= 12 && hour < 18) greeting.value = '🌤 下午好';
   else greeting.value = '🌙 晚上好';
});
</script>

<template>
   <StSpace direction="vertical" align="center" gap="0">
      <StSpace gap="1.5rem" fill class="px-4 py-6 max-w-[80.68rem] shrink-0">
         <StSpace direction="vertical" align="start" gap="1.5rem" fill>
            <h1 class="st-font-hero-bold">{{ greeting }}，{{ username }}</h1>
            <StSpace gap="1.5rem" fill-x class="mt-4">
               <RecentSubmissionCard />
               <RecentLearningCard />
            </StSpace>
            <DailyChallengeCard />
         </StSpace>
         <StSpace direction="vertical" gap="1.5rem" fill>
            <SubmissionStatusCard />
            <StSpace gap="1.5rem" fill>
               <RankingCard />
               <AchievementsCard />
            </StSpace>
         </StSpace>
      </StSpace>
   </StSpace>
</template>
