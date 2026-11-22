<script setup lang="ts">
import StSpace from '~/components/st/Space/index.vue';
import { FingerprintThree } from '@icon-park/vue-next';

const error = useError();
const isDev = import.meta.dev;

useHead({ meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }] });

const message = computed(() => {
   if (isDev) {
      return [error.value?.message, error.value?.stack]
         .filter(Boolean)
         .join('\n\n');
   }
   switch (error.value?.statusCode) {
      case 404:
         return '页面似乎不见了……';
      case 403:
         return '您没有权限访问此页面。';
      default:
         return '服务器发生错误，请稍后再试。';
   }
});

const traceId = computed(() => {
   if (isDev) return undefined;
   const data = error.value?.data as { traceId?: string } | undefined;
   return typeof data?.traceId === 'string' && data.traceId.length > 0
      ? data.traceId
      : undefined;
});
</script>

<template>
   <StSpace
      direction="vertical"
      align="center"
      justify="center"
      gap="2rem"
      class="min-h-dvh w-full px-4 py-8 text-white">
      <StGlitchText :glitchText="String(error?.statusCode ?? 404)" />
      <StSpace direction="vertical" gap="clamp(2.5rem, 12dvh, 10rem)" align="center" class="max-w-full">
         <div
            class="st-font-third-normal max-w-full text-center whitespace-pre-wrap [overflow-wrap:anywhere] sm:max-w-[50vw]"
            :class="isDev ? 'st-selectable max-h-[32dvh] overflow-auto text-left max-sm:text-sm' : ''">
            {{ message }}
         </div>
         <div v-if="traceId" class="st-font-caption text-white/40">
            错误编号：{{ traceId }}
         </div>
         <NuxtLink to="/app/dashboard" class="animate-pulse">
            <StSpace direction="vertical" gap="0.75rem" align="center">
               <FingerprintThree size="2rem" />
               <div class="st-font-caption text-accent-200">点击返回首页</div>
            </StSpace>
         </NuxtLink>
      </StSpace>
   </StSpace>
   <FeedbackButton variant="floating" :trace-id="traceId" />
   <FeedbackDialog />
</template>
