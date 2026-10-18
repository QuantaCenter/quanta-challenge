<script setup lang="ts">
import { Calendar, CalendarThree, CheckOne, ErrorPicture, FireTwo, Round } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';

const { $trpc } = useNuxtApp();

const { data: dailyProblem } = useNuxtData('daily-problem');
const { data: continueCheckinCounts } = useNuxtData('continue-checkin-counts');
const { data: hasCheckedIn } = useNuxtData('has-checked-in');
const { data: hasCompletedTodayChallenge } = useNuxtData(
   'has-completed-today-challenge'
);

const difficultyBorderMap: Record<string, string> = {
   easy: 'border-secondary',
   medium: 'border-warning',
   hard: 'border-primary',
   very_hard: 'border-error',
};

// daily-problem 数据可能在 hydration 期间才到达，期间翻转分支会损坏 SSR DOM，先推迟到 hydration 结束
const hydrated = ref(false);
onMounted(() => {
   void nextTick().then(() => {
      hydrated.value = true;
   });
});
const showProblem = computed(() => hydrated.value && !!dailyProblem.value);

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
   <StCard :icon="Calendar" title="每日一题" class="!h-fit">
      <div v-if="showProblem" class="mt-4 flex items-stretch gap-2.5 w-full">
         <a
            class="relative flex-1 min-w-0 h-[10rem] rounded-xl overflow-hidden border-2 transition-all"
            :class="
               difficultyBorderMap[(dailyProblem as any).difficulty] ??
               'border-accent-400'
            "
            :href="`/challenge/editor/${(dailyProblem as any).pid}`"
            target="_blank">
            <StImage
               :src="
                  (dailyProblem as any).coverImageName
                     ? `/api/static/${(dailyProblem as any).coverImageName}`
                     : ''
               "
               :thumbhash="(dailyProblem as any).coverImageThumbhash"
               :thumbhash-url="(dailyProblem as any).coverImageThumbhashUrl"
               width="100%"
               height="10rem"
               alt="Cover Image">
               <template #fallback="{ style }">
                  <StSpace
                     fill
                     center
                     class="bg-accent-600/75 text-accent-500"
                     :style="style">
                     <ErrorPicture size="2rem" />
                  </StSpace>
               </template>
            </StImage>
            <div
               class="absolute inset-x-0 top-0 h-[4.75rem] bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none"></div>
            <div
               class="absolute inset-x-0 top-0 p-2.5 flex items-start justify-between gap-2">
               <div class="flex-1 min-w-0 line-clamp-1 font-bold text-white">
                  {{ (dailyProblem as any).title }}
               </div>
               <StSpace gap="0.375rem" align="center" no-shrink>
                  <StTag
                     v-for="tag in (dailyProblem as any).tags.slice(0, 2)"
                     size="small"
                     :key="tag.name"
                     :color="tag.color ?? void 0"
                     :content="tag.name" />
                  <StTag
                     v-if="(dailyProblem as any).tags.length > 2"
                     size="small"
                     color="#6D6D6D"
                     :content="`+${(dailyProblem as any).tags.length - 2}`" />
               </StSpace>
            </div>
         </a>
         <div
            class="w-[7.75rem] shrink-0 self-end flex flex-col gap-2.5 rounded-xl bg-accent-700/60 p-2.5">
            <div class="st-font-body-normal leading-snug">
               已连续签到
               <span
                  class="text-[1.25rem] font-bold font-family-manrope text-primary mx-0.5">
                  {{ (continueCheckinCounts as string) ?? '--' }}
               </span>
               天
            </div>
            <StButton
               @click="handleCheckin"
               class="!h-[2.25rem] w-full"
               :class="{
                  '!bg-accent-400':
                     hasCheckedIn || !hasCompletedTodayChallenge,
               }"
               :loading="checkinLoading"
               :disabled="hasCheckedIn || !hasCompletedTodayChallenge">
               <StSpace gap="0.5rem" align="center">
                  <FireTwo v-show="!checkinLoading" size="1.25rem" />
                  <span class="st-font-body-bold">
                     {{ hasCheckedIn ? '已签到' : '签到' }}
                  </span>
               </StSpace>
            </StButton>
            <StSpace gap="0.375rem" align="center">
               <Round
                  v-if="!hasCompletedTodayChallenge"
                  class="text-accent-200 shrink-0" />
               <CheckOne v-else class="text-secondary shrink-0" />
               <span class="st-font-tooltip">
                  {{
                     hasCompletedTodayChallenge
                        ? '今日挑战已完成'
                        : '需要完成今日挑战'
                  }}
               </span>
            </StSpace>
         </div>
      </div>

      <div
         v-else
         class="text-accent-400 min-h-[9rem] mt-4 w-full flex flex-col items-center justify-center gap-3">
         <CalendarThree size="2.5rem" :strokeWidth="2" />
         <div class="st-font-body-normal">当日暂无题目</div>
      </div>
   </StCard>
</template>
