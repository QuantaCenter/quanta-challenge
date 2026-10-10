<script setup lang="ts">
import { BookmarkThree, Box } from '@icon-park/vue-next';
import { useRecentLearning } from '~/composables/use-learning';
import { useLearningVisits } from '~/composables/use-learning-visits';

// 访问记录在这里取一次，传进纯读函数（不能在它内部懒调 useState）
const visits = useLearningVisits();
const items = computed(() => useRecentLearning(5, undefined, visits.slice.value));

const loading = ref(false);
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
         <NuxtLink
            to="/app/topics"
            class="st-font-tooltip text-primary hover:opacity-75 transition-opacity">
            去看看专题
         </NuxtLink>
      </StSpace>

      <StSpace
         v-else
         direction="vertical"
         gap="0.75rem"
         class="mt-5 w-full flex-1 min-h-0 overflow-y-auto hide-scrollbar"
         fill-x>
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
                  <NuxtLink
                     v-if="item.completed"
                     :to="`/app/topics/${item.topicId}`"
                     class="ml-auto shrink-0 inline-flex rounded-full transition-transform duration-150 hover:opacity-80 active:scale-90">
                     <LearningStatusAction :done="false" size="sm" />
                  </NuxtLink>
               </StSpace>

               <StSpace align="center" gap="0.75rem" fill-x>
                  <LearningProgressBar
                     :progress="item.percent / 100"
                     :percent="item.percent"
                     :completed="item.completed"
                     :is-reading-only="item.isReadingOnly"
                     :read="item.read" />
                  <NuxtLink
                     v-if="!item.completed"
                     :to="`/app/topics/${item.topicId}`"
                     class="shrink-0 inline-flex rounded-full transition-transform duration-150 hover:opacity-80 active:scale-90">
                     <LearningStatusAction :done="false" size="sm" />
                  </NuxtLink>
                  <LearningStatusAction v-else :done="true" size="sm" />
               </StSpace>
            </StSpace>
         </div>
      </StSpace>

      <div class="bottom-mask w-full h-[4.125rem] absolute bottom-0"></div>
   </StCard>
</template>

<style scoped src="../_styles/index.css" />
