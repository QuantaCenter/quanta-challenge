<script setup lang="ts">
import { Box, FiveStarBadge } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import LinkButton from '../_components/LinkButton.vue';

const props = defineProps<{
   status?: 'dashboard' | 'personal-space';
   isVisitor?: boolean;
   username?: string;
}>();

const { $trpc } = useNuxtApp();

const { data: achievements, pending: loading } = useAsyncData(
   props.isVisitor
      ? 'achieved-achievements-visitor'
      : 'achieved-achievements-self',
   () => {
      if (props.isVisitor && props.username) {
         return $trpc.public.dashboard.getAchievements.query({
            username: props.username,
         });
      } else {
         return $trpc.protected.achievement.getAchievedAchievements.query();
      }
   }
);

const formatAchievedDate = (date: string) => {
   const dayText = dayjs(date).format('YYYY.MM.DD');
   return `于 ${dayText} 获得`;
};

const hideMask = ref(false);
const container = useTemplateRef('container');
onMounted(() => {
   if (!container.value) return;
   const el = container.value;
   const scrollHandler = () => {
      if (!container.value) return;
      hideMask.value = el.scrollHeight - el.scrollTop <= el.clientHeight + 10;
   };
   el.addEventListener('scroll', scrollHandler);
   onBeforeUnmount(() => {
      el.removeEventListener('scroll', scrollHandler);
   });
});
</script>

<template>
   <StCard
      :icon="FiveStarBadge"
      :title="status === 'personal-space' ? '我的成就' : '徽章墙'"
      class="w-full h-full !pb-0 overflow-hidden relative">
      <template #header-right>
         <LinkButton
            v-if="status !== 'personal-space'"
            to="/app/achievements"
            description="查看成就" />
      </template>
      <div class="w-full h-5"></div>
      <div
         ref="container"
         class="w-full h-full relative hide-scrollbar min-h-[16rem] max-md:min-h-[24rem]"
         :class="{ 'overflow-auto': achievements?.length }">
         <StSkeleton :loading="loading" class="w-full h-full absolute top-0">
            <template #loading>
               <StSpace direction="vertical" gap="0.75rem">
                  <StSkeletonItem
                     v-for="i in 8"
                     :key="i"
                     class="w-full h-20"
                     rounded="lg" />
               </StSpace>
            </template>

            <StSpace
               v-if="achievements?.length"
               fill
               direction="vertical"
               gap="0.75rem"
               class="absolute top-0">
               <StSpace
                  v-for="achievement in achievements"
                  :key="achievement.id"
                  fill-x
                  align="center"
                  gap="0.5rem"
                  class="p-3 rounded-xl bg-accent-500">
                  <StImage
                     :src="achievement.badgeUrl"
                     width="3.4375rem"
                     height="3.4375rem"
                     class="shrink-0" />
                  <StSpace
                     fill
                     direction="vertical"
                     justify="center"
                     gap="0.25rem">
                     <div class="st-font-body-bold">
                        {{ achievement.name }}
                     </div>
                     <div class="st-font-caption">
                        {{ formatAchievedDate(achievement.achievedAt) }}
                     </div>
                  </StSpace>
               </StSpace>
               <div class="w-full h-1.5"></div>
            </StSpace>

            <StSpace
               v-else
               fill
               direction="vertical"
               gap="0.75rem"
               align="center"
               justify="center"
               class="text-accent-400 pb-4">
               <Box size="3.625rem" :strokeWidth="2" />
               <div class="st-font-body-normal">暂无任何成就</div>
            </StSpace>
         </StSkeleton>
      </div>
      <div
         class="bottom-mask w-full h-[3rem] absolute bottom-0 transition-opacity"
         :style="{ opacity: hideMask ? 0 : 1 }"></div>
   </StCard>
</template>

<style scoped src="../_styles/index.css" />
