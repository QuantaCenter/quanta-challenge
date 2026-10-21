<script setup lang="ts">
import { LoadingFour } from '@icon-park/vue-next';

// useLoadingIndicator 是应用级单例，参数以首个调用方为准；新增其他调用方时需保持一致
const { isLoading } = useLoadingIndicator({
   // 导航（中间件 + 目标页 async setup）超过该时长仍未完成才显示，快速切页不闪烁
   throttle: 400,
   // 默认会在完成后再保留 500ms，这里需要随目标页进场立即淡出
   hideDelay: 0,
});
</script>

<template>
   <Transition name="st-page-loading">
      <div
         v-if="isLoading"
         class="fixed top-0 right-0 bottom-0 left-[9.3125rem] z-[999] bg-background flex flex-col items-center justify-center gap-3 text-accent-300">
         <LoadingFour class="animate-spin text-[1.75rem]" />
         <span class="st-font-caption">加载中…</span>
      </div>
   </Transition>
</template>

<style scoped>
.st-page-loading-enter-active,
.st-page-loading-leave-active {
   transition: opacity 0.2s ease-in-out;
}

.st-page-loading-enter-from,
.st-page-loading-leave-to {
   opacity: 0;
}
</style>
