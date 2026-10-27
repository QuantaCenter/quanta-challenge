<script setup lang="ts">
import { BookOne, CheckOne, Right } from '@icon-park/vue-next';
import {
   useLearningActiveCourses,
   useLearningArticles,
   useLearningRecommendedCourses,
   useLearningTopics,
} from '~/composables/use-learning';

useSeoMeta({
   title: '学习 - Quanta Challenge',
   description: '按专题学习前端知识；课程是专题的集合，专题引用文章。',
});

const content = useLearningContentStore();
const topics = useLearningTopics(content);
const visits = useLearningVisits();
const activeCourses = useLearningActiveCourses(content, visits.slice.value);
const recommendedCourses = useLearningRecommendedCourses(
   content,
   visits.slice.value,
);

// 文章页的地址要带一个专题上下文，所以取第一个引用它的专题
const allArticleRows = useLearningArticles(content).map((article) => ({
   article,
   // 文章是一等实体：没有专题收录也能打开，所以一律指向独立文章页
   to: `/app/articles/${article.id}`,
}));
const { items: articleRows, sentinelRef } = usePagedList(allArticleRows, 10);

</script>

<template>
   <StSpace
      fill
      direction="vertical"
      align="center"
      gap="0"
      class="hide-scrollbar overflow-auto">
      <StSpace fill-y direction="vertical" class="mt-6 w-[65rem]">
         <h1 class="text-[2.5rem] font-bold text-white">学习</h1>

         <StSpace align="start" gap="1.5rem" fill-x class="mt-5">
            <!-- 左列：课程栏 + 文章（文章跟在课程栏下面，同一列） -->
            <div class="flex-1 min-w-0">
               <StSpace align="center" gap="0.75rem" fill-x>
                  <h2 class="st-font-third-bold text-white">课程</h2>
                  <NuxtLink
                     to="/app/courses"
                     class="ml-auto st-font-caption text-secondary hover:opacity-75 transition-opacity flex items-center gap-[0.25rem]">
                     <span>全部课程</span>
                     <Right size="0.875rem" />
                  </NuxtLink>
               </StSpace>

               <LearningCoverRail class="mt-4">
                  <div
                     v-for="topic in topics"
                     :key="topic.id"
                     class="w-[15rem] shrink-0">
                     <LearningTopicCard
                        :topic="topic"
                        :to="`/app/learning/${topic.id}`" />
                  </div>
               </LearningCoverRail>

               <StSpace align="center" gap="0.75rem" fill-x class="mt-8">
                  <h2 class="st-font-third-bold text-white">文章</h2>
                  <NuxtLink
                     to="/app/articles"
                     class="ml-auto st-font-caption text-secondary hover:opacity-75 transition-opacity flex items-center gap-[0.25rem]">
                     <span>全部文章</span>
                     <Right size="0.875rem" />
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
            </div>

            <!-- 右列：最近学习（比课程栏长，下面接推荐课程） -->
            <aside class="w-[17rem] shrink-0">
               <div class="w-full p-5 rounded-[0.75rem] bg-accent-600">
                  <StSpace direction="vertical" gap="0.875rem" fill-x>
                     <span class="st-font-body-bold text-accent-100">
                        最近学习
                     </span>

                     <NuxtLink
                        v-for="row in activeCourses"
                        :key="row.course.id"
                        :to="`/app/courses/${row.course.id}`"
                        class="block w-full">
                        <div
                           class="w-full p-3 rounded-[0.75rem] bg-accent-500/60 hover:bg-accent-500 transition-colors flex flex-col gap-[0.375rem]">
                           <StSpace align="center" gap="0.5rem" fill-x>
                              <BookOne
                                 class="shrink-0 text-secondary"
                                 size="1rem"
                                 :strokeWidth="3" />
                              <span
                                 class="st-font-caption text-accent-100 truncate">
                                 {{ row.course.name }}
                              </span>
                              <CheckOne
                                 v-if="row.progress.completed"
                                 class="ml-auto shrink-0 text-success"
                                 size="1rem"
                                 :strokeWidth="4" />
                              <span
                                 v-else
                                 class="ml-auto shrink-0 st-font-tooltip font-family-manrope text-accent-100">
                                 {{ row.progress.percent }}%
                              </span>
                           </StSpace>
                           <LearningProgressBar
                              :progress="row.progress.percent / 100"
                              :percent="row.progress.percent"
                              :completed="row.progress.completed"
                              :is-reading-only="row.progress.isReadingOnly"
                              :read="row.progress.read" />
                           <span
                              class="mt-1 st-font-tooltip text-accent-400">
                              {{ row.progress.finishedTopics }} /
                              {{ row.progress.topicCount }} 个专题 ·
                              {{ row.progress.finishedArticles }} /
                              {{ row.progress.articleCount }} 篇文章
                           </span>
                        </div>
                     </NuxtLink>

                     <div
                        v-if="activeCourses.length === 0"
                        class="w-full p-3 rounded-[0.75rem] bg-accent-500/40 st-font-tooltip text-accent-300">
                        暂无在学习中的课程
                     </div>

                     <span class="st-font-body-bold text-accent-100">
                        推荐课程
                     </span>

                     <NuxtLink
                        v-for="course in recommendedCourses"
                        :key="course.id"
                        :to="`/app/courses/${course.id}`"
                        class="block w-full">
                        <div
                           class="w-full p-3 rounded-[0.75rem] border border-accent-500 hover:border-secondary transition-colors flex flex-col gap-[0.25rem]">
                           <StSpace align="center" gap="0.5rem" fill-x>
                              <BookOne
                                 class="shrink-0 text-accent-300"
                                 size="1rem"
                                 :strokeWidth="3" />
                              <span
                                 class="st-font-caption text-accent-100 truncate">
                                 {{ course.name }}
                              </span>
                              <span
                                 class="ml-auto shrink-0 st-font-tooltip text-accent-400">
                                 未开始
                              </span>
                           </StSpace>
                           <span
                              class="st-font-tooltip text-accent-400 line-clamp-2">
                              {{ course.description }}
                           </span>
                        </div>
                     </NuxtLink>

                     <div
                        v-if="recommendedCourses.length === 0"
                        class="w-full p-3 rounded-[0.75rem] bg-accent-500/40 st-font-tooltip text-accent-300">
                        全部课程都已经开始了
                     </div>
                  </StSpace>
               </div>
            </aside>
         </StSpace>

         <StSpacer fill flex no-shrink height="4rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
