<script setup lang="ts">
import { BookOne, Left } from '@icon-park/vue-next';
import {
   articlesOfCourse,
   courseProgress,
   courseTopics,
   isCoursePublished,
   topicsOfArticle,
   useLearningCourse,
} from '~/composables/use-learning';
import { useLearningVisits } from '~/composables/use-learning-visits';

const route = useRoute();
const courseId = computed(() => String(route.params.courseId));

const content = useLearningContentStore();
const visits = useLearningVisits();
const course = computed(() => useLearningCourse(courseId.value, content));
const progress = computed(() =>
   course.value
      ? courseProgress(
           course.value,
           visits.slice.value,
           courseTopics(course.value.id, content.slice.value),
           articlesOfCourse(course.value.id, content.slice.value),
        )
      : undefined,
);
const topics = computed(() =>
   course.value ? courseTopics(course.value.id, content) : [],
);

// 课程里的每篇文章都带一个专题上下文，方便点进文章页
const articleRows = computed(() =>
   (course.value ? articlesOfCourse(course.value.id, content) : []).map((article) => {
      // 文章不依赖专题：统一指向独立文章页（专题上下文只用于「返回」时的去向）
      const owner = topicsOfArticle(article.id, content).find(
         (topic) => topic.courseId === course.value?.id,
      );
      return {
         article,
         to: `/app/articles/${article.id}`,
         description: owner ? `收录于 ${owner.name}` : article.summary,
      };
   }),
);

useSeoMeta({
   title: computed(() =>
      course.value ? `${course.value.name} - 课程 - Quanta Challenge` : '课程',
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
         v-if="!course"
         content="没有这门课程"
         class="pt-[10rem]" />

      <!-- 课程是唯一需要审核的实体：待审课程不应被当成「已上架」浏览 -->
      <StEmptyStatus
         v-else-if="!isCoursePublished(course)"
         :content="`《${course.name}》还在审核中，通过后才会出现在这里`"
         class="pt-[10rem]" />

      <StSpace v-else fill-y direction="vertical" class="mt-6 w-[65rem]">
         <StSpace align="center" gap="0.5rem" class="text-accent-300">
            <NuxtLink
               to="/app/courses"
               class="st-font-caption hover:text-secondary transition-colors flex items-center gap-1">
               <Left size="0.875rem" />
               全部课程
            </NuxtLink>
            <span class="st-font-caption text-accent-400">/</span>
            <span class="st-font-caption text-accent-100">
               {{ course.name }}
            </span>
         </StSpace>

         <StSpace align="end" gap="1rem" fill-x class="mt-5">
            <StSpace direction="vertical" gap="0.5rem" class="min-w-0 flex-1">
               <StSpace align="center" gap="0.75rem">
                  <BookOne
                     class="text-secondary shrink-0"
                     size="1.75rem"
                     :strokeWidth="3" />
                  <h1 class="text-[2.5rem] font-bold text-white">
                     {{ course.name }}
                  </h1>
               </StSpace>
               <p class="st-font-body-normal text-accent-300">
                  {{ course.description }}
               </p>
            </StSpace>

            <div
               class="shrink-0 w-[15rem] p-4 rounded-[1rem] bg-accent-600 flex flex-col gap-2">
               <LearningProgressBar
                  :progress="(progress?.percent ?? 0) / 100"
                  :percent="progress?.percent ?? 0"
                  :completed="progress?.completed ?? false"
                  :is-reading-only="progress?.isReadingOnly ?? false"
                  :read="progress?.read ?? false" />
               <span class="st-font-tooltip text-accent-300">
                  {{ progress?.finishedTopics }} / {{ progress?.topicCount }}
                  个专题 ·
                  {{ progress?.finishedArticles }} /
                  {{ progress?.articleCount }} 篇文章
               </span>
               <span v-if="progress?.completedAt" class="st-font-tooltip text-success">
                  {{ progress.completedAt }} 完成
               </span>
            </div>
         </StSpace>

         <StSpace align="center" gap="0.75rem" fill-x class="mt-8">
            <h2 class="st-font-third-bold text-white">专题</h2>
            <span class="st-font-tooltip text-accent-400">
               {{ topics.length }} 个
            </span>
         </StSpace>

         <div class="mt-4">
            <LearningCoverRail>
               <div
                  v-for="topic in topics"
                  :key="topic.id"
                  class="w-[15rem] shrink-0">
                  <LearningTopicCard
                     :topic="topic"
                     :to="`/app/topics/${topic.id}`" />
               </div>
            </LearningCoverRail>
         </div>

         <StSpace align="center" gap="0.75rem" fill-x class="mt-8">
            <h2 class="st-font-third-bold text-white">文章</h2>
            <span class="st-font-tooltip text-accent-400">
               {{ articleRows.length }} 篇
            </span>
         </StSpace>

         <StGrid fill-x :cols="4" gap="1rem" class="mt-4">
            <LearningArticleCard
               v-for="row in articleRows"
               :key="row.article.id"
               :article="row.article"
               :to="row.to" />
         </StGrid>

         <StSpacer fill flex no-shrink height="4rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
