<script setup lang="ts">
import StSpace from '~/components/st/Space/index.vue';
import { FingerprintThree } from '@icon-park/vue-next';

const error = useError();

const message = computed(() => {
   return `${error.value?.message} | ${error.value?.stack}`;
   if (import.meta.dev) {
   }
   if (error.value?.statusCode === 404) {
      return '页面似乎不见了……';
   } else if (error.value?.statusCode === 500) {
      return '服务器发生错误，请稍后再试。';
   } else if (error.value?.statusCode === 403) {
      return '您没有权限访问此页面。';
   }
   return error.value?.message ?? '页面似乎不见了……';
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
         <div class="st-font-third-normal max-w-[50vw] text-center">
            {{ message }}
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
