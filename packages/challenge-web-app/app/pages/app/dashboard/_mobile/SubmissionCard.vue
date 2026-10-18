<script setup lang="ts">
import { TerminationFile } from '@icon-park/vue-next';

const { $trpc } = useNuxtApp();

const { data: submissionData } = useAsyncData(
   'recent-submission',
   () => $trpc.protected.dashboard.getRecentSubmissions.query()
);

const statusText = computed(() =>
   (submissionData.value as any)?.result === 'failed' ? '未通过' : '已通过'
);
</script>

<template>
   <StCard title="最近提交" class="select-none" bordered>
      <StSpace
         v-if="submissionData"
         direction="vertical"
         gap="0.625rem"
         class="mt-3 w-full">
         <div class="flex items-center gap-1 w-full min-w-0">
            <span class="line-clamp-1 st-font-caption text-accent-100 flex-1 min-w-0">
               {{ (submissionData as any).title }}
            </span>
         </div>
         <div class="flex items-end gap-2 w-full">
            <div class="flex items-end gap-1 shrink-0 min-w-0 whitespace-nowrap">
               <span
                  class="text-[2.25rem] leading-[1.8rem] font-bold font-family-manrope text-transparent bg-gradient-to-br from-success via-secondary to-success bg-clip-text">
                  {{ (submissionData as any).score || '--' }}
               </span>
               <span class="st-font-caption pb-0.5">分</span>
            </div>
            <span
               class="ml-auto shrink-0 py-1 px-2 rounded-md st-font-tooltip whitespace-nowrap"
               :class="
                  (submissionData as any).result === 'failed'
                     ? 'bg-primary text-white'
                     : 'bg-secondary text-accent-700'
               ">
               {{ statusText }}
            </span>
         </div>
         <StSpace justify="between" fill-x>
            <StSpace direction="vertical" gap="0.125rem">
               <span class="st-font-tooltip text-primary">超过</span>
               <span class="text-primary font-family-manrope font-bold text-sm">
                  {{ ((submissionData as any).aheadRate * 100).toFixed(2) }}%
               </span>
            </StSpace>
            <StSpace direction="vertical" gap="0.125rem" align="end">
               <span class="st-font-tooltip text-accent-300">通过率</span>
               <span class="font-family-manrope font-bold text-sm">
                  {{ ((submissionData as any).passRate * 100).toFixed(2) }}%
               </span>
            </StSpace>
         </StSpace>
      </StSpace>

      <StSpace
         v-else
         direction="vertical"
         gap="0.75rem"
         align="center"
         justify="center"
         class="text-accent-400 min-h-[9rem] mt-4 w-full">
         <TerminationFile size="2.5rem" :strokeWidth="2" />
         <div class="st-font-body-normal">暂无提交记录</div>
      </StSpace>
   </StCard>
</template>
