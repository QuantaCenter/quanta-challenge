<script setup lang="ts">
import { BookmarkThree, Box, CheckOne } from '@icon-park/vue-next';
import { useRecentLearning } from '~/composables/use-learning';
import { useLearningVisits } from '~/composables/use-learning-visits';
import type { RecentLearningItem } from '~/utils/learning-progress';

// 访问记录在这里取一次，传进纯读函数
const visits = useLearningVisits();
const items = computed(() => useRecentLearning(5, undefined, visits.slice.value));

const loading = ref(false);

// 纯阅读专题没有题目，进度按已读文章比例计算
const itemPercent = (item: RecentLearningItem): number =>
   item.isReadingOnly
      ? item.articleCount > 0
         ? Math.floor((item.finishedArticles / item.articleCount) * 100)
         : 0
      : item.percent;

// 列表到两端或不足一屏时隐藏对应渐隐
const listRef = ref<HTMLElement | null>(null);
const atListTop = ref(true);
const atListBottom = ref(false);

const updateListEdges = () => {
   const el = listRef.value;
   if (!el) return;
   atListTop.value = el.scrollTop <= 0;
   atListBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 1;
};

watch(items, () => nextTick(updateListEdges));
onMounted(() => {
   updateListEdges();
   window.addEventListener('resize', updateListEdges);
});
onBeforeUnmount(() => window.removeEventListener('resize', updateListEdges));
</script>

<template>
   <StCard title="最近学习" class="aspect-square !pb-0 overflow-hidden">
      <StSkeleton v-if="loading" loading class="mt-6">
         <template #loading>
            <StSpace direction="vertical" gap="0.75rem">
               <StSkeletonItem rounded="lg" class="w-full h-[5rem]" />
               <StSkeletonItem rounded="lg" class="w-full h-[5rem]" />
               <StSkeletonItem rounded="lg" class="w-full h-[5rem]" />
            </StSpace>
         </template>
      </StSkeleton>

      <StSpace
         v-else-if="items.length === 0"
         fill
         direction="vertical"
         gap="0.75rem"
         align="center"
         justify="center"
         class="text-accent-400 pb-4">
         <Box size="3.625rem" :strokeWidth="2" />
         <div class="st-font-body-normal">暂无学习记录</div>
      </StSpace>

      <div v-else class="mt-5 w-full relative flex-1 min-h-0 flex flex-col">
         <div
            ref="listRef"
            class="flex-1 min-h-0 flex flex-col gap-[0.75rem] overflow-y-auto hide-scrollbar pb-4"
            @scroll="updateListEdges">
            <div
               v-for="item in items"
               :key="item.topicId"
               class="w-full rounded-[0.75rem] bg-accent-500 p-3">
               <StSpace direction="vertical" gap="0.625rem" fill-x>
                  <StSpace align="center" gap="0.5rem" fill-x>
                     <BookmarkThree
                        class="shrink-0 text-accent-100"
                        size="1.25rem"
                        :strokeWidth="4" />
                     <span
                        class="st-font-body-normal truncate min-w-0 text-accent-100">
                        {{ item.courseName }} / {{ item.topicName }}
                     </span>
                     <!-- 完成态标识 -->
                     <div
                        v-if="item.completed"
                        class="ml-auto shrink-0 w-[1.5rem] h-[1.5rem] flex items-center justify-center">
                        <CheckOne
                           class="text-success"
                           size="1.25rem"
                           :strokeWidth="4" />
                     </div>
                  </StSpace>

                  <StSpace align="center" gap="0.75rem" fill-x>
                     <LearningProgressBar
                        :progress="itemPercent(item) / 100"
                        :percent="itemPercent(item)"
                        :completed="item.completed"
                        :is-reading-only="false"
                        :read="item.read" />
                     <NuxtLink
                        :to="`/app/learning/${item.topicId}`"
                        class="shrink-0 inline-flex rounded-full transition-transform duration-150 hover:opacity-80 active:scale-90">
                        <LearningStatusAction :done="false" size="sm" />
                     </NuxtLink>
                  </StSpace>
               </StSpace>
            </div>
         </div>

         <div
            class="top-mask w-full h-[2rem] absolute top-0 transition-opacity duration-150"
            :class="atListTop ? 'opacity-0' : 'opacity-100'"></div>
         <div
            class="bottom-mask w-full h-[4.125rem] absolute bottom-0 transition-opacity duration-300"
            :class="atListBottom ? 'opacity-0' : 'opacity-100'"></div>
      </div>
   </StCard>
</template>

<style scoped src="../_styles/index.css" />
