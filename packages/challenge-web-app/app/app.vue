<script setup lang="ts">
import useAuthStore from './stores/auth-store';
import { isQuantaLoginPath } from './utils/quanta-login';

// 做题、设计稿与工坊使用全屏布局，不参与主站桌面的 1440px 最小宽度
const isImmersivePath = (path: string) =>
   isQuantaLoginPath(path) ||
   path.startsWith('/challenge') ||
   path.startsWith('/design/') ||
   path.startsWith('/workshop/');

const authStore = useAuthStore();
const route = useRoute();
// 主站和工作区在各自的工具栏内提供入口。
const showFloatingFeedback = computed(
   () => !/^\/(?:app|challenge|design|workshop)(?:\/|$)/.test(route.path),
);
onMounted(() => {
   authStore.initToken();
});
</script>

<template>
   <div
      class="bg-background text-white font-family-sans text-base"
      :class="{ 'md:min-w-[1440px]': !isImmersivePath(route.path) }"
   >
      <NuxtPage />
      <StImageViewerProvider />
      <FeedbackButton v-if="showFloatingFeedback" variant="floating" />
      <FeedbackDialog />
   </div>
</template>

<style lang="css">
.page-enter-active,
.page-leave-active {
   transition: all 0.15s ease-in-out;
}

.page-enter-from,
.page-leave-to {
   opacity: 0;
   transform: translateY(1rem);
}

.page-enter-to,
.page-leave-from {
   opacity: 1;
   transform: translateY(0);
}
</style>
