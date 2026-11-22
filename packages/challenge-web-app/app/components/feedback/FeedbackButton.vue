<script setup lang="ts">
import { MessageSquareText } from 'lucide-vue-next';

const props = defineProps<{
   variant: 'header' | 'mobile' | 'toolbar' | 'sidebar' | 'floating';
   traceId?: string;
}>();

const { openFeedback } = useFeedback();
const mounted = useMounted();

const variants = {
   header: 'gap-2.5 rounded-full bg-accent-600 px-6 py-4 font-bold text-white hover:bg-accent-500',
   mobile: 'size-10 rounded-full text-white active:bg-accent-500',
   toolbar: 'size-9 rounded-md text-accent-200 hover:bg-accent-500 hover:text-white',
   sidebar: 'size-[var(--mini-sidebar-item,2.75rem)] rounded-full bg-accent-600 text-accent-200 hover:bg-accent-500 hover:text-white',
   floating: 'fixed z-[1000] bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] min-h-11 gap-2 rounded-full border border-accent-500 bg-accent-600 px-4 text-sm font-semibold text-white shadow-lg shadow-black/35 hover:bg-accent-500 sm:bottom-6 sm:right-6',
};
</script>

<template>
   <button
      type="button"
      aria-label="意见反馈"
      aria-haspopup="dialog"
      :disabled="!mounted"
      :title="variant === 'header' || variant === 'floating' ? undefined : '意见反馈'"
      class="inline-flex shrink-0 cursor-pointer items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="variants[variant]"
      @click="openFeedback($event, props.traceId)">
      <MessageSquareText
         :size="variant === 'header' || variant === 'floating' ? 20 : 18"
         :class="variant === 'mobile' ? 'size-[1.375rem]' : undefined"
         aria-hidden="true" />
      <span v-if="variant === 'header' || variant === 'floating'">意见反馈</span>
   </button>
</template>
