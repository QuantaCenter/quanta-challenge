<script setup lang="ts">
import { Caution } from '@icon-park/vue-next';

defineProps<{ count: number }>();

const handleView = () => {
   navigateTo({ path: '/app/notifications', query: { type: 'WARNING' } });
};
</script>

<template>
   <Transition name="warning-notice">
      <div
         v-if="count > 0"
         role="alert"
         class="fixed right-6 bottom-6 z-40 p-4 rounded-xl border border-error/50 bg-accent-600 text-white shadow-2xl flex items-center gap-8 max-md:top-16 max-md:bottom-auto max-md:left-3 max-md:right-3 max-md:gap-4">
         <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
               <Caution size="1rem" fill="#EF4444" :strokeWidth="3" />
               <div class="st-font-body-bold !text-sm">严重警告</div>
            </div>
            <div class="st-font-caption text-accent-300 max-w-72">
               你有 {{ count }} 条未读的严重警告，请尽快查看
            </div>
         </div>
         <button
            type="button"
            class="ml-auto shrink-0 py-1 px-3 rounded-sm text-xs text-white bg-error hover:bg-error/80 active:scale-95 transition-all cursor-pointer"
            @click="handleView">
            去查看
         </button>
      </div>
   </Transition>
</template>

<style scoped>
.warning-notice-enter-active,
.warning-notice-leave-active {
   transition: all 0.25s ease;
}

.warning-notice-enter-from,
.warning-notice-leave-to {
   opacity: 0;
   transform: translateY(1rem);
}

/* 移动端弹窗位于顶部：动画方向改为从上方滑入/滑出 */
@media (max-width: 767.98px) {
   .warning-notice-enter-from,
   .warning-notice-leave-to {
      transform: translateY(-1rem);
   }
}
</style>
