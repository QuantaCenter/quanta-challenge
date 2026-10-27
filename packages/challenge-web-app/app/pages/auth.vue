<script setup lang="ts">
const route = useRoute();

// 登录、注册、WebAuthn 页面内容单屏展示，锁定 html/body 滚动，
// 避免移动端 100vh 大于可视区域导致的整页滚动
const LOCK_PATH_PATTERN = /^\/auth\/(login|register)/;
const scrollLock = computed(() => LOCK_PATH_PATTERN.test(route.path));

useHead({
   htmlAttrs: {
      class: computed(() => (scrollLock.value ? 'auth-scroll-lock' : '')),
   },
});
</script>

<template>
   <StMessageProvider>
      <NuxtPage />
   </StMessageProvider>
</template>
