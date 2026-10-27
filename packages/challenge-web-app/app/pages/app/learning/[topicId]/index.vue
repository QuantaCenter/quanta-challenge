<script setup lang="ts">
import { Left, Plus } from '@icon-park/vue-next';
import {
   articlesOfTopic,
   courseTopics,
   useLearningCourse,
   useLearningTopic,
} from '~/composables/use-learning';
import { useRecordVisit } from '~/composables/use-learning-visits';

const route = useRoute();
const topicId = computed(() => String(route.params.topicId));

const content = useLearningContentStore();
const topic = computed(() => useLearningTopic(topicId.value, content));
const course = computed(() =>
   topic.value ? useLearningCourse(topic.value.courseId, content) : undefined,
);

// 打开专题也算一次「最近学习」
useRecordVisit('topic', () => topic.value?.cuid);

// 同一课程下的兄弟专题，当前这个高亮
const siblingTopics = computed(() =>
   topic.value ? courseTopics(topic.value.courseId, content) : [],
);

const allArticleRows = computed(() =>
   (topic.value ? articlesOfTopic(topic.value, content) : []).map((article) => ({
      article,
      to: `/app/learning/${topicId.value}/${article.id}`,
   })),
);
const { items: articleRows, sentinelRef } = usePagedList(allArticleRows, 10);

useSeoMeta({
   title: computed(() =>
      topic.value ? `${topic.value.name} - 学习 - Quanta Challenge` : '学习',
   ),
});
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      align="center"
      gap="0"
      class="hide-scrollbar overflow-auto">
      <StEmptyStatus
         v-if="!topic"
         content="没有这个专题"
         class="pt-[10rem]" />

      <StSpace v-else fill-y direction="vertical" class="mt-6 w-[65rem]">
         <StSpace align="center" gap="0.5rem" class="text-accent-300">
            <NuxtLink
               :to="`/app/courses/${topic.courseId}`"
               class="st-font-caption hover:text-secondary transition-colors flex items-center gap-1">
               <Left size="0.875rem" />
               {{ course?.name ?? '课程' }}
            </NuxtLink>
            <span class="st-font-caption text-accent-400">/</span>
            <span class="st-font-caption text-accent-100">
               {{ topic.name }}
            </span>
         </StSpace>

         <StSpace align="end" gap="1rem" fill-x class="mt-5">
            <StSpace direction="vertical" gap="0.5rem" class="min-w-0 flex-1">
               <h1 class="text-[2.5rem] font-bold text-white">
                  {{ topic.name }}
               </h1>
               <p class="st-font-body-normal text-accent-300">
                  {{ topic.description }}
               </p>
            </StSpace>
            <span class="shrink-0 st-font-tooltip text-accent-400 mb-2">
               {{ allArticleRows.length }} 篇文章
            </span>
         </StSpace>

         <div class="mt-6">
            <LearningCoverRail>
               <div
                  v-for="item in siblingTopics"
                  :key="item.id"
                  class="w-[15rem] shrink-0">
                  <LearningTopicCard
                     :topic="item"
                     :to="`/app/learning/${item.id}`"
                     :selected="item.id === topic.id" />
               </div>
            </LearningCoverRail>
         </div>

         <StSpace align="center" gap="0.75rem" fill-x class="mt-8">
            <h2 class="st-font-third-bold text-white">文章</h2>
            <span class="st-font-tooltip text-accent-400">
               {{ allArticleRows.length }} 篇
            </span>
            <NuxtLink to="/app/publish/article/new" class="ml-auto">
               <StButton size="sm" bordered>
                  <StSpace align="center" gap="0.375rem">
                     <Plus size="1rem" />
                     <span>发布文章</span>
                  </StSpace>
               </StButton>
            </NuxtLink>
         </StSpace>

         <StSpace direction="vertical" gap="0" fill-x class="mt-4">
            <LearningArticleRow
               v-for="row in articleRows"
               :key="row.article.id"
               :article="row.article"
               :to="row.to" />
         </StSpace>

         <div ref="sentinelRef" class="h-1 w-full shrink-0"></div>

         <StEmptyStatus
            v-if="allArticleRows.length === 0"
            content="这个专题还没有引用文章"
            class="py-10" />

         <StSpacer fill flex no-shrink height="4rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
