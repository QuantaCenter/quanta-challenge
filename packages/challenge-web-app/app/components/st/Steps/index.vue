<script setup lang="ts">
import type { StepsStep, StepsTone } from './type';

/** 多阶段任务进度：步骤条、状态文案、附加信息与可选进度条 */
const props = withDefaults(
   defineProps<{
      steps: StepsStep[];
      /** 当前状态文案 */
      status?: string;
      tone?: StepsTone;
      /** 状态行右侧的附加信息 */
      extra?: string;
      /** 0～1，传入时显示进度条 */
      percent?: number | null;
   }>(),
   { status: '', tone: 'idle', extra: '', percent: null },
);

const TONE_CLASS: Record<StepsTone, string> = {
   idle: 'text-accent-300',
   active: 'text-warning',
   success: 'text-success',
   warning: 'text-warning',
   error: 'text-error',
};

const percentWidth = computed(() =>
   props.percent === null
      ? '0%'
      : `${Math.min(100, Math.max(0, Math.floor(props.percent * 100)))}%`,
);
</script>

<template>
   <StSpace direction="vertical" gap="0.75rem" fill-x>
      <div class="w-full px-2">
         <StProgress direction="horizontal" :steps="props.steps" />
      </div>
      <StSpace
         v-if="props.status || props.extra"
         fill-x
         justify="between"
         align="center"
         gap="1rem">
         <span class="st-font-body-normal" :class="TONE_CLASS[props.tone]">
            {{ props.status }}
         </span>
         <span v-if="props.extra" class="shrink-0 st-font-caption text-accent-300">
            {{ props.extra }}
         </span>
      </StSpace>
      <div
         v-if="props.percent !== null"
         class="w-full h-1.5 rounded-full bg-accent-500 overflow-hidden">
         <div
            class="h-full bg-primary transition-[width] duration-200"
            :style="{ width: percentWidth }" />
      </div>
   </StSpace>
</template>
