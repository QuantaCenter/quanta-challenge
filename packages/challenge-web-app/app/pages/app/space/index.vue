<script setup lang="ts">
import useAuthStore from '~/stores/auth-store';

// 重定向必须在路由守卫里完成：若放进 setup 里 await navigateTo，二次导航会与 out-in 页面过渡、
// Suspense 交错（auth-guard 需要请求/续签时尤为明显），目标页永远挂载不上，内容区空白。
definePageMeta({
   middleware: [
      () => {
         const authStore = useAuthStore();
         return navigateTo(
            authStore.user?.name
               ? `/app/space/${authStore.user.name}`
               : '/auth/login',
            { replace: true },
         );
      },
   ],
});
</script>

<template>
   <div></div>
</template>
