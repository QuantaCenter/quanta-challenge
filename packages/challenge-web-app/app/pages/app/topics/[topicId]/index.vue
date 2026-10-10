<script setup lang="ts">
import { Left, Plus } from '@icon-park/vue-next';
import {
   articlesOfTopic,
   courseTopics,
   topicsOfArticle,
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

// 同一课程下的兄弟专题，用来做上方的专题栏（当前这个高亮）
const siblingTopics = computed(() =>
   topic.value ? courseTopics(topic.value.courseId, content) : [],
);

const articleRows = computed(() =>
   (topic.value ? articlesOfTopic(topic.value, content) : []).map((article) => {
      const others = topicsOfArticle(article.id, content)
         .filter((item) => item.id !== topic.value?.id)
         .map((item) => item.name);
      return {
         article,
         to: `/app/topics/${topicId.value}/${article.id}`,
         // 引用不是归属：一篇文章可能同时挂在别的专题下，悬浮时顺带说清
         description: others.length
            ? `${article.summary}（也见于 ${others.join(' · ')}）`
            : article.summary,
      };
   }),
);

useSeoMeta({
   title: computed(() =>
      topic.value ? `${topic.value.name} - 专题 - Quanta Challenge` : '专题',
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
               {{ articleRows.length }} 篇文章
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
                     :to="`/app/topics/${item.id}`"
                     :selected="item.id === topic.id" />
               </div>
            </LearningCoverRail>
         </div>

         <StSpace align="center" gap="0.75rem" fill-x class="mt-8">
            <h2 class="st-font-third-bold text-white">文章</h2>
            <span class="st-font-tooltip text-accent-400">
               {{ articleRows.length }} 篇
            </span>
            <NuxtLink to="/app/publish/article" class="ml-auto">
               <StButton size="sm" bordered>
                  <StSpace align="center" gap="0.375rem">
                     <Plus size="1rem" />
                     <span>发布文章</span>
                  </StSpace>
               </StButton>
            </NuxtLink>
         </StSpace>

         <StGrid fill-x :cols="4" gap="1rem" class="mt-4">
            <LearningArticleCard
               v-for="row in articleRows"
               :key="row.article.id"
               :article="row.article"
               :to="row.to"
               :description="row.description" />
         </StGrid>

         <StEmptyStatus
            v-if="articleRows.length === 0"
            content="这个专题还没有引用文章"
            class="py-10" />

         <StSpacer fill flex no-shrink height="4rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
