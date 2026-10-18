<script setup lang="ts">
import { Fire } from '@icon-park/vue-next';

const props = defineProps<{
   status?: 'dashboard' | 'personal-space';
   isVisitor?: boolean;
   username?: string;
}>();

const card = useTemplateRef('card');

const width = ref(0);
useResizeObserver(
   () => (card.value?.$el as HTMLElement) ?? null,
   (entries) => {
      width.value = entries[0].contentRect.width;
   },
);

const { $trpc } = useNuxtApp();
const { data: submissionStatusData, pending: loading } = useAsyncData(
   props.isVisitor
      ? 'submission-status-data-visitor'
      : 'submission-status-data-self',
   () => {
      if (props.isVisitor && props.username) {
         return $trpc.public.dashboard.getSubmissionStatus.query({
            username: props.username,
         });
      } else {
         return $trpc.protected.dashboard.getSubmissionStatus.query();
      }
   },
);

const scrollContainer = useTemplateRef('scrollContainer');
const showEndMask = ref(false);
const updateEndMask = () => {
   const el = scrollContainer.value;
   if (!el) return;
   showEndMask.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 8;
};
onMounted(() => {
   updateEndMask();
   scrollContainer.value?.addEventListener('scroll', updateEndMask);
});
</script>

<template>
   <StCard
      :icon="Fire"
      ref="card"
      title="提交情况"
      class="w-full !h-fit mt-4 relative overflow-clip">
      <div
         ref="scrollContainer"
         class="mt-4 overflow-x-auto flex shrink-0 w-full hide-scrollbar relative"
         :class="[
            status === 'personal-space'
               ? 'md:min-h-[14.625rem]'
               : 'min-w-[36.625rem]',
         ]">
         <StHeatMap
            :scroll-into-view="status !== 'personal-space'"
            :loading="loading"
            :current-year="new Date().getFullYear()"
            :rows="9"
            :data="submissionStatusData ?? {}" />
      </div>
      <div
         :class="[showEndMask ? 'opacity-100' : 'opacity-0']"
         class="absolute bottom-0 h-full w-4 bg-gradient-to-l right-4 from-accent-600 via-accent-600/70 to-transparent transition-opacity"></div>
   </StCard>
</template>

<style scoped src="../_styles/index.css" />
