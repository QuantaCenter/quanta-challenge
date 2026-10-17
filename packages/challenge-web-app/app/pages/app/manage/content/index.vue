<script setup lang="ts">
import { Right } from '@icon-park/vue-next';
import {
   isCoursePublished,
   useLearningArticles,
   useAllTopics,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';

/**
 * 内容管理总览：课程 / 专题 / 文章用 tab 切换。
 *
 * 为什么需要这一页：三者的编辑页各自独立，若没有总览，
 * 「刚发布的东西去哪了 / 在哪改」就只能靠记忆。
 * 每一行都直达编辑页，并按引用链标注它被谁引用。
 */
useSeoMeta({
   title: '内容管理 - Quanta Challenge',
   description: '课程 / 专题 / 文章的统一入口，课程审核也在这里。',
});

const { courses } = useLearningContentStore();

const content = useLearningContentStore();
const articles = computed(() => useLearningArticles(content));

const tab = ref('article');
const tabs = [
   { label: '文章', value: 'article' },
   { label: '专题', value: 'topic' },
   { label: '课程', value: 'course' },
];

const topicRows = computed(() =>
   useAllTopics(content).map((topic) => {
      const course = courses.value.find((item) => item.id === topic.courseId);
      return {
         id: topic.id,
         // 专题的创建与编辑收在课程发布页里，这里直达所属课程
         to: `/app/publish/course/${topic.courseId}`,
         title: topic.name,
         summary: topic.description,
         meta: `${topic.articleIds.length} 篇文章 · ${course?.name ?? '未归属课程'}`,
         status: course && isCoursePublished(course) ? '已上架' : '所属课程待审',
         statusOk: Boolean(course && isCoursePublished(course)),
      };
   }),
);
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-[46rem] pb-[10rem] my-6">
         <h1 class="st-font-hero-bold">内容管理</h1>

         <StTabs v-model="tab" :options="tabs" centered />

         <!-- 文章 -->
         <template v-if="tab === 'article'">
            <!-- 收紧行内边距：通用行样式自带 py-4，这里减半（行渲染成 a 标签） -->
            <div class="w-full [&>a]:!py-2 [&>div]:!py-2">
               <LearningArticleRow
                  v-for="article in articles"
                  :key="`article-${article.id}`"
                  :article="article"
                  :to="`/app/publish/article/${article.id}`"
                  :divider="false" />
            </div>

            <StEmptyStatus
               v-if="articles.length === 0"
               content="还没有文章"
               class="py-6 rounded-[0.5rem] border border-dashed border-accent-300" />
         </template>

         <!-- 专题 -->
         <template v-else-if="tab === 'topic'">
            <NuxtLink
               v-for="row in topicRows"
               :key="`topic-${row.id}`"
               :to="row.to"
               class="group w-full p-3 rounded-[0.75rem] bg-accent-600 border border-transparent hover:border-secondary/50 transition-all flex items-center gap-3">
               <StSpace direction="vertical" gap="0.25rem" class="min-w-0 flex-1">
                  <span class="st-font-body-bold text-accent-100 truncate">
                     {{ row.title }}
                  </span>
                  <span class="st-font-caption text-accent-300 truncate">
                     {{ row.summary }}
                  </span>
               </StSpace>
               <span class="st-font-tooltip text-accent-400 shrink-0">
                  {{ row.meta }}
               </span>
               <span
                  class="st-font-tooltip px-3 py-1 rounded-full border shrink-0"
                  :class="
                     row.statusOk
                        ? 'text-secondary border-secondary/40'
                        : 'text-accent-300 border-accent-400'
                  ">
                  {{ row.status }}
               </span>
               <Right
                  class="shrink-0 text-accent-400 group-hover:text-secondary group-hover:translate-x-0.5 transition-all" />
            </NuxtLink>

            <StEmptyStatus
               v-if="topicRows.length === 0"
               content="还没有专题"
               class="py-6 rounded-[0.5rem] border border-dashed border-accent-300" />
         </template>

         <!-- 课程 -->
         <template v-else>
            <StGrid fill-x :cols="3" gap="1rem">
               <LearningCourseCard
                  v-for="course in courses"
                  :key="`course-${course.id}`"
                  :course="course"
                  :to="`/app/publish/course/${course.id}`"
                  show-status />
            </StGrid>

            <StEmptyStatus
               v-if="courses.length === 0"
               content="还没有课程"
               class="py-6 rounded-[0.5rem] border border-dashed border-accent-300" />
         </template>
      </StSpace>
   </StSpace>
</template>
