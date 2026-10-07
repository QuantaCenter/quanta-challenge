<script setup lang="ts">
import {
   Calendar,
   CalendarThree,
   CheckOne,
   FireTwo,
   Round,
} from '@icon-park/vue-next';
import dayjs from 'dayjs';
import DailyChallengeSkeleton from '../_skeletons/DailyChallengeSkeleton.vue';
import ProblemCard from '../_components/ProblemCard.vue';
import CheckinInfoSkeleton from '../_skeletons/CheckinInfoSkeleton.vue';
import { useMessage } from '~/components/st/Message/use-message';

const { $trpc } = useNuxtApp();

export type DailyProblem = NonNullable<
   Awaited<ReturnType<typeof $trpc.public.daily.getProblem.query>>
>;

// 当前查看的日期，默认为今天（YYYY-MM-DD）
const selectedDate = ref(dayjs().format('YYYY-MM-DD'));

const {
   data: dailyProblem,
   error: dailyProblemError,
   pending: isDailyProblemPending,
} = useAsyncData(
   'daily-problem',
   () => $trpc.public.daily.getProblem.query({ date: selectedDate.value }),
   { watch: [selectedDate], dedupe: 'cancel' }
);

const { data: continueCheckinCounts } = useAsyncData(
   'continue-checkin-counts',
   () => $trpc.protected.daily.continuesCheckinCount.query(),
   { transform: (count) => count.toString().padStart(2, '0') }
);

const { data: hasCheckedIn } = useAsyncData('has-checked-in', () =>
   $trpc.protected.daily.hasCheckedin.query()
);

const { data: hasCompletedTodayChallenge } = useAsyncData(
   'has-completed-today-challenge',
   () => $trpc.protected.daily.hasCompletedDailyProblem.query()
);

const { data: trackingAchievement, refresh: refreshTrackingAchievement } =
   useAsyncData('tracking-achievement', () =>
      $trpc.protected.achievement.getCurrentCheckinAchievement.query()
   );

const achievementProgress = computed(() => {
   const progress = trackingAchievement.value?.progress ?? 0;
   return (progress * 100).toFixed(0) + '%';
});

const isLoadingCheckinInfo = computed(() => {
   return (
      continueCheckinCounts.value === void 0 ||
      hasCheckedIn.value === void 0 ||
      hasCompletedTodayChallenge.value === void 0
   );
});

const message = useMessage();
const checkinLoading = ref(false);
const handleCheckin = async () => {
   if (hasCheckedIn.value || !hasCompletedTodayChallenge.value) return;

   try {
      checkinLoading.value = true;
      await atLeastTime(500, $trpc.protected.daily.checkin.mutate());
      hasCheckedIn.value = true;
      const count = await $trpc.protected.daily.continuesCheckinCount.query();
      continueCheckinCounts.value = count.toString().padStart(2, '0');
      message.success('签到成功');
      refreshTrackingAchievement();
   } catch (err) {
      if (err instanceof Error) {
         message.error('签到失败，请稍后重试: ' + err.message);
      } else {
         message.error('签到失败，请稍后重试');
      }
   } finally {
      checkinLoading.value = false;
   }
};
</script>

<template>
   <StCard :icon="Calendar" class="h-full" title="每日一题">
      <StSpace v-if="!dailyProblemError" class="w-full h-full mt-5">
         <StSpace direction="vertical" gap="1rem" class="w-full h-full">
            <StDateIndicator v-model="selectedDate" class="w-full" />
            <div class="flex flex-1 min-h-0 overflow-hidden w-full relative">
               <StSkeleton
                  :loading="isDailyProblemPending"
                  class="h-[21.3125rem]">
                  <template #loading>
                     <DailyChallengeSkeleton class="absolute" />
                  </template>
                  <a
                     v-if="dailyProblem"
                     class="w-full"
                     :href="`/challenge/editor/${dailyProblem.pid}`"
                     target="_blank">
                     <ProblemCard :problem="dailyProblem" />
                  </a>
                  <StSpace
                     v-else
                     fill
                     direction="vertical"
                     gap="0.75rem"
                     align="center"
                     justify="center"
                     class="text-accent-400 min-h-[18.3125rem]">
                     <CalendarThree size="2.5rem" :strokeWidth="2" />
                     <div class="st-font-body-normal">当日暂无题目</div>
                  </StSpace>
               </StSkeleton>
            </div>
         </StSpace>
         <StSpace
            direction="vertical"
            gap="1rem"
            class="w-full"
            :class="[
               isLoadingCheckinInfo ? 'h-[calc(100%-3.25rem)]' : 'h-full',
            ]">
            <StSkeleton :loading="isLoadingCheckinInfo" class="h-full">
               <template #loading>
                  <CheckinInfoSkeleton />
               </template>

               <StSpace
                  fill-x
                  gap="0.5rem"
                  align="center"
                  class="h-[3.125rem] text-[1.25rem] font-bold">
                  本月已连续签到
                  <span class="text-[1.25rem] font-family-manrope text-primary">
                     {{ continueCheckinCounts }}
                  </span>
                  天
               </StSpace>

               <StSpace
                  fill-x
                  direction="vertical"
                  gap="0.75rem"
                  class="p-3 bg-accent-500 rounded-lg">
                  <template v-if="trackingAchievement">
                     <StSpace fill-x gap="0.625rem" align="center">
                        <StImage
                           width="4rem"
                           height="4rem"
                           class="shrink-0 grayscale-100"
                           :src="trackingAchievement?.badgeUrl ?? ''"
                           alt="徽章" />
                        <StSpace
                           direction="vertical"
                           class="flex-1"
                           gap="0.25rem">
                           <span class="st-font-body-bold text-white">
                              {{ trackingAchievement?.name ?? '无签到成就' }}
                           </span>
                           <span
                              class="st-font-caption text-white line-clamp-2">
                              {{
                                 trackingAchievement?.description ?? '暂无描述'
                              }}
                           </span>
                        </StSpace>
                     </StSpace>
                     <StSpace fill-x gap="0.5rem" align="center">
                        <StSpace
                           fill-x
                           class="h-2 bg-accent-400 rounded-full overflow-hidden">
                           <div
                              class="h-full bg-primary transition-all duration-300"
                              :style="{
                                 width: achievementProgress,
                              }" />
                        </StSpace>
                        <span
                           class="text-[0.625rem] font-family-manrope text-white">
                           {{ achievementProgress }}
                        </span>
                     </StSpace>
                  </template>
                  <template v-else>
                     <StSpace
                        align="center"
                        fill-x
                        justify="center"
                        gap="0.5rem">
                        <div class="st-font-body-normal text-accent-300">
                           暂无签到成就
                        </div>
                     </StSpace>
                  </template>
               </StSpace>

               <StSpace direction="vertical" gap="1rem" class="w-full h-full">
                  <StSpace
                     direction="vertical"
                     justify="end"
                     gap="0.625rem"
                     class="w-full h-full flex-1">
                     <StSpace gap="0.5rem" align="center">
                        <Round
                           v-if="!hasCompletedTodayChallenge"
                           class="text-accent-200" />
                        <CheckOne v-else class="text-secondary" />
                        <span class="st-font-capture"> 需要完成今日挑战 </span>
                     </StSpace>
                     <StButton
                        @click="handleCheckin"
                        :class="[
                           '!h-[2.25rem] w-full',
                           {
                              '!bg-accent-400':
                                 hasCheckedIn || !hasCompletedTodayChallenge,
                           },
                        ]"
                        :loading="checkinLoading"
                        :disabled="hasCheckedIn || !hasCompletedTodayChallenge">
                        <StSpace gap="0.5rem" align="center">
                           <FireTwo v-show="!checkinLoading" size="1.25rem" />
                           <span class="st-font-body-bold">
                              {{ hasCheckedIn ? '已签到' : '签到' }}
                           </span>
                        </StSpace>
                     </StButton>
                  </StSpace>
               </StSpace>
            </StSkeleton>
         </StSpace>
      </StSpace>

      <StSpace
         v-else
         fill
         direction="vertical"
         gap="0.75rem"
         align="center"
         justify="center"
         class="text-accent-400 min-h-[20rem]">
         <CalendarThree size="3.625rem" :strokeWidth="2" />
         <div class="st-font-body-normal">每日一题未解锁</div>
      </StSpace>
   </StCard>
</template>

<style scoped src="../_styles/index.css" />
