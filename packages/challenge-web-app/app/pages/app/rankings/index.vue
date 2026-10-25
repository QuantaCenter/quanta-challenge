<script setup lang="ts">
import { ToTop } from '@icon-park/vue-next';
import CurrentRankCard from './_components/CurrentRankCard.vue';
import ProfileCard from './_components/ProfileCard.vue';
import RankingTrendsCard from './_components/RankingTrendsCard.vue';
import MobileRankSummaryCard from './_components/MobileRankSummaryCard.vue';
import RankTable from './_components/RankTable.vue';
import type { IRanking } from './_types';
import DEFAULT_AVATAR_URL from '@/assets/images/default-avatar.webp';

const { $trpc } = useNuxtApp();

const { data: rankings, pending: loadingRankings } = useAsyncData(
   'rankings',
   () => $trpc.public.rank.getGlobalRankings.query(),
   {
      transform: (data): IRanking[] =>
         data.map((item) => ({
            userId: item.userId,
            correctRate: item.correctRate,
            imageUrl: item.avatarUrl ?? DEFAULT_AVATAR_URL,
            rank: item.rank,
            score: item.score,
            passCount: item.passCount,
            userName: item.userName,
            uid: item.uid,
         })),
   }
);

const rankContainer = useTemplateRef('rankContainer');
const showToTop = ref(false);
onMounted(() => {
   if (!rankContainer.value) return;
   const scrollHandler = useThrottleFn(() => {
      showToTop.value = rankContainer.value
         ? rankContainer.value.$el.scrollTop > 300
         : false;
   }, 100);
   rankContainer.value.$el.addEventListener('scroll', scrollHandler);

   const timer = setInterval(scrollHandler, 1000);

   onBeforeUnmount(() => {
      rankContainer.value?.$el.removeEventListener('scroll', scrollHandler);
      clearInterval(timer);
   });
});

const handleToTop = () => {
   if (!rankContainer.value) return;
   rankContainer.value.$el.scrollTo({
      top: 0,
      behavior: 'smooth',
   });
};

</script>

<template>
   <StSpace
      fill-y
      justify="center"
      gap="1.25rem"
      class="pt-6 max-md:flex-col max-md:px-4">
      <StSpace
         ref="rankContainer"
         gap="0"
         fill-y
         direction="vertical"
         align="center"
         class="pb-48 max-md:pb-24 relative">
         <h1
            class="text-[2.5rem] font-bold text-white w-full max-md:text-[1.5rem] max-md:leading-[1.2] max-md:mb-4">
            排行榜
         </h1>
         <MobileRankSummaryCard class="max-md:flex md:hidden" />
         <StSpace
            fill-x
            class="bg-background h-6 sticky top-[4.25rem] max-md:top-14 max-md:h-4"></StSpace>
         <RankTable :data="rankings ?? []" :loading="loadingRankings" />
         <StSpace
            @click="handleToTop"
            class="fixed bottom-6 max-md:bottom-24 bg-accent-500 opacity-60 hover:opacity-100 cursor-pointer border border-transparent hover:border-secondary transition-all p-4 py-2 rounded-lg"
            :class="{
               '!opacity-0 translate-y-4 pointer-events-none': !showToTop,
            }"
            gap="0.5rem"
            align="center">
            <ToTop />
            返回顶部
         </StSpace>
      </StSpace>
      <StSpace
         direction="vertical"
         align="center"
         gap="0.75rem"
         class="!sticky bottom-0 w-[18.875rem] pb-4 self-end min-h-[calc(100vh-5.75rem-1.25rem)] max-md:w-full max-md:!static max-md:self-auto max-md:min-h-0 max-md:hidden">
         <ProfileCard />
         <CurrentRankCard :is-listed="isListed" />
         <RankingTrendsCard />
      </StSpace>
   </StSpace>
</template>

<style src="@/assets/css/utils.css" scoped />
