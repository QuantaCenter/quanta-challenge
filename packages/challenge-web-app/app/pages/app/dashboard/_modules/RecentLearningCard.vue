<script setup lang="ts">
import { BookmarkThree, Box, CheckOne } from '@icon-park/vue-next';
import LearningProgressBar from '~/components/learning/LearningProgressBar.vue';
import StatusAction from '~/components/learning/StatusAction.vue';

const { $trpc } = useNuxtApp();
const { data: items, status } = useAsyncData('dashboard-recent-learning', () =>
   $trpc.protected.dashboard.getRecentLearning.query(),
);

const listRef = ref<HTMLElement | null>(null);
const atTop = ref(true);
const atBottom = ref(true);

const updateEdges = () => {
   const element = listRef.value;
   if (!element) return;
   atTop.value = element.scrollTop <= 1;
   atBottom.value =
      element.scrollHeight - element.scrollTop - element.clientHeight <= 1;
};

watch(items, () => nextTick(updateEdges));
onMounted(() => {
   updateEdges();
   window.addEventListener('resize', updateEdges);
});
onBeforeUnmount(() => window.removeEventListener('resize', updateEdges));
</script>

<template>
   <StCard title="最近学习" class="aspect-square !pb-0 overflow-hidden">
      <StSkeleton v-if="status === 'pending'" loading class="mt-6">
         <template #loading>
            <StSpace direction="vertical" gap="0.75rem">
               <StSkeletonItem rounded="lg" class="w-full h-[5rem]" />
               <StSkeletonItem rounded="lg" class="w-full h-[5rem]" />
               <StSkeletonItem rounded="lg" class="w-full h-[5rem]" />
            </StSpace>
         </template>
      </StSkeleton>

      <StSpace
         v-else-if="!items?.length"
         fill
         direction="vertical"
         gap="0.75rem"
         align="center"
         justify="center"
         class="text-accent-400 pb-4">
         <Box size="3.625rem" :strokeWidth="2" />
         <div class="st-font-body-normal">暂无学习记录</div>
      </StSpace>

      <div v-else class="relative mt-5 flex min-h-0 w-full flex-1 flex-col">
         <div
            ref="listRef"
            class="hide-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-4"
            @scroll="updateEdges">
            <div
               v-for="item in items"
               :key="item.topicId"
               class="w-full rounded-[0.75rem] bg-accent-500 p-3">
               <div class="flex w-full flex-col gap-[0.625rem]">
                  <div class="flex w-full items-center gap-2">
                     <BookmarkThree
                        class="shrink-0 text-accent-100"
                        size="1.25rem"
                        :strokeWidth="4" />
                     <span class="min-w-0 truncate st-font-body-normal text-accent-100">
                        {{ item.title }}
                     </span>
                     <div
                        v-if="item.completed"
                        class="ml-auto flex size-6 shrink-0 items-center justify-center">
                        <CheckOne class="text-success" size="1.25rem" :strokeWidth="4" />
                     </div>
                  </div>

                  <div class="flex w-full items-center gap-3">
                     <LearningProgressBar :percent="item.percent" />
                     <NuxtLink
                        :to="`/app/learning/${item.topicId}`"
                        :aria-label="`继续学习 ${item.title}`"
                        class="inline-flex shrink-0 rounded-full transition-transform duration-150 hover:opacity-80 active:scale-90">
                        <StatusAction :done="false" size="sm" />
                     </NuxtLink>
                  </div>
               </div>
            </div>
         </div>

         <div
            class="top-mask pointer-events-none absolute top-0 h-8 w-full transition-opacity duration-150"
            :class="atTop ? 'opacity-0' : 'opacity-100'"></div>
         <div
            class="bottom-mask pointer-events-none absolute bottom-0 h-[4.125rem] w-full transition-opacity duration-300"
            :class="atBottom ? 'opacity-0' : 'opacity-100'"></div>
      </div>
   </StCard>
</template>

<style scoped src="../_styles/index.css" />
