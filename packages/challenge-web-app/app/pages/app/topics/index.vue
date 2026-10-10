<script setup lang="ts">
import { BookOne, CheckOne, Plus, Right } from '@icon-park/vue-next';
import {
   topicsOfArticle,
   useLearningActiveCourses,
   useLearningArticles,
   useLearningRecommendedCourses,
   useLearningTopics,
} from '~/composables/use-learning';

useSeoMeta({
   title: '专题 - Quanta Challenge',
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
const articleRows = useLearningArticles(content).map((article) => {
   const owners = topicsOfArticle(article.id, content);
   return {
      article,
      // 文章是一等实体：没有专题收录也能打开，所以一律指向独立文章页
      to: `/app/articles/${article.id}`,
      description: owners.length
         ? `收录于 ${owners.map((topic) => topic.name).join(' · ')}`
         : article.summary,
   };
});

const articleCount = articleRows.length;
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      align="center"
      gap="0"
      class="hide-scrollbar overflow-auto">
      <StSpace fill-y direction="vertical" class="mt-6 w-[65rem]">
         <h1 class="text-[2.5rem] font-bold text-white">专题</h1>

         <StSpace align="start" gap="1.5rem" fill-x class="mt-5">
            <!-- 左列：专题栏 + 文章（文章跟在专题栏下面，同一列） -->
            <div class="flex-1 min-w-0">
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

               <StSpace align="center" gap="0.75rem" fill-x class="mt-8">
                  <h2 class="st-font-third-bold text-white">文章</h2>
                  <span class="st-font-tooltip text-accent-400">
                     全部 {{ articleCount }} 篇
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

               <StGrid fill-x :cols="3" gap="1rem" class="mt-4">
                  <LearningArticleCard
                     v-for="row in articleRows"
                     :key="row.article.id"
                     :article="row.article"
                     :to="row.to"
                     :description="row.description" />
               </StGrid>
            </div>

            <!-- 右列：我学习的课程（比专题栏长，下面接推荐课程与全部课程入口） -->
            <aside class="w-[17rem] shrink-0">
               <div class="w-full p-5 rounded-[1.25rem] bg-accent-600">
                  <StSpace direction="vertical" gap="0.875rem" fill-x>
                     <span class="st-font-body-bold text-accent-100">
                        我学习的课程
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
                           <span class="st-font-tooltip text-accent-400">
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

                     <div class="h-[1px] w-full bg-accent-500" />

                     <span class="st-font-tooltip text-accent-400">
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

                     <NuxtLink
                        to="/app/courses"
                        class="block w-full mt-1 st-font-caption text-secondary hover:opacity-75 transition-opacity">
                        <StSpace align="center" gap="0.25rem">
                           <span>全部课程</span>
                           <Right size="0.875rem" />
                        </StSpace>
                     </NuxtLink>
                  </StSpace>
               </div>
            </aside>
         </StSpace>

         <StSpacer fill flex no-shrink height="4rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
