<script setup lang="ts">
import StSpace from '~/components/st/Space/index.vue';
import { FingerprintThree } from '@icon-park/vue-next';

const error = useError();
const isDev = import.meta.dev;

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
      class="w-screen h-screen text-white translate-y-8">
      <StGlitchText :glitchText="String(error?.statusCode ?? 404)" />
      <StSpace direction="vertical" gap="10rem" align="center">
         <div
            class="st-font-third-normal max-w-[50vw] text-center whitespace-pre-wrap"
            :class="isDev ? 'text-left' : ''">
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
</template>
