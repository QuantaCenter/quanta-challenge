<script setup lang="ts">
import {
   BookOne,
   DocDetail,
   FileEditingOne,
   Plus,
   Right,
   School,
} from '@icon-park/vue-next';
import {
   courseTopics,
   isCoursePublished,
   useLearningArticles,
   useAllTopics,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import { useMessage } from '~/components/st/Message/use-message';

/**
 * 内容库总览：课程 / 专题 / 文章三张表放在一页里。
 *
 * 为什么需要这一页：三者的编辑页各自独立，若没有总览，
 * 「刚发布的东西去哪了 / 在哪改」就只能靠记忆。
 * 这里每一行都直达编辑页，并按引用链标注它被谁引用。
 */
useSeoMeta({
   title: '内容库 - Quanta Challenge',
   description: '课程 / 专题 / 文章的统一入口，包含待审核的课程。',
});

const message = useMessage();
const { courses, resetToSeed, exportContent } = useLearningContentStore();

const content = useLearningContentStore();
const articles = computed(() => useLearningArticles(content));

const articleRows = computed(() =>
   articles.value.map((article) => ({
      id: article.id,
      to: `/app/publish/article/${article.id}`,
      title: article.title,
      summary: article.summary,
      meta: article.problems.length
         ? `${article.problems.length} 道题`
         : '纯阅读',
      previewTo: `/app/publish/article/${article.id}/preview`,
   })),
);

const topicRows = computed(() =>
   useAllTopics(content).map((topic) => {
      const course = courses.value.find((item) => item.id === topic.courseId);
      return {
         id: topic.id,
         to: `/app/publish/topic/${topic.id}`,
         title: topic.name,
         summary: topic.description,
         meta: `${topic.articleIds.length} 篇文章 · ${course?.name ?? '未归属课程'}`,
         status: course && isCoursePublished(course) ? '已上架' : '所属课程待审',
         statusOk: Boolean(course && isCoursePublished(course)),
      };
   }),
);

const courseRows = computed(() =>
   courses.value.map((course) => ({
      id: course.id,
      to: `/app/publish/course/${course.id}`,
      title: course.name,
      summary: course.description,
      meta: `${courseTopics(course.id, content).length} 个专题`,
      status:
         course.status === 'published'
            ? '已上架'
            : course.status === 'pending'
              ? '待审核'
              : '草稿',
      statusOk: course.status === 'published',
   })),
);

const restore = () => {
   resetToSeed();
   message.success('已回到初始内容', '课程 / 专题 / 文章恢复成初始状态');
};

// 内容只在浏览器里，给一个能自己留底的出口
const downloadBackup = () => {
   const blob = new Blob([exportContent()], { type: 'application/json' });
   const url = URL.createObjectURL(blob);
   const link = document.createElement('a');
   link.href = url;
   link.download = `learning-content-${new Date().toISOString().slice(0, 10)}.json`;
   link.click();
   URL.revokeObjectURL(url);
   message.success('已导出内容备份', '课程 / 专题 / 文章的 JSON');
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-[46rem] pb-[10rem] my-6">
         <StSpace align="end" gap="1rem" fill-x>
            <h1 class="st-font-hero-bold">内容库</h1>
            <span class="st-font-caption text-accent-300 mb-2">
               课程 {{ courseRows.length }} · 专题 {{ topicRows.length }} ·
               文章 {{ articleRows.length }}
            </span>
         </StSpace>

         <!-- 文章 -->
         <StSpace direction="vertical" gap="0.75rem" fill-x>
            <StSpace align="center" gap="0.5rem" fill-x>
               <DocDetail class="text-accent-200" size="1rem" :strokeWidth="3" />
               <span class="st-font-body-bold text-accent-100 flex-1">文章</span>
               <NuxtLink to="/app/publish/article/new">
                  <StButton size="sm" bordered>
                     <StSpace align="center" gap="0.375rem">
                        <Plus size="1rem" />
                        <span>写文章</span>
                     </StSpace>
                  </StButton>
               </NuxtLink>
            </StSpace>

            <NuxtLink
               v-for="row in articleRows"
               :key="`article-${row.id}`"
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
               <NuxtLink
                  :to="row.previewTo"
                  class="shrink-0"
                  @click.stop>
                  <StButton size="sm" bordered>
                     <span>预览</span>
                  </StButton>
               </NuxtLink>
               <span class="st-font-tooltip text-accent-400 shrink-0 font-family-manrope">
                  {{ row.meta }}
               </span>
               <Right
                  class="shrink-0 text-accent-400 group-hover:text-secondary group-hover:translate-x-0.5 transition-all" />
            </NuxtLink>

            <StEmptyStatus
               v-if="articleRows.length === 0"
               content="还没有文章"
               class="py-6" />
         </StSpace>

         <!-- 专题 -->
         <StSpace direction="vertical" gap="0.75rem" fill-x class="mt-4">
            <StSpace align="center" gap="0.5rem" fill-x>
               <BookOne class="text-accent-200" size="1rem" :strokeWidth="3" />
               <span class="st-font-body-bold text-accent-100 flex-1">专题</span>
               <NuxtLink to="/app/publish/topic">
                  <StButton size="sm" bordered>
                     <StSpace align="center" gap="0.375rem">
                        <Plus size="1rem" />
                        <span>创建专题</span>
                     </StSpace>
                  </StButton>
               </NuxtLink>
            </StSpace>

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
               class="py-6" />
         </StSpace>

         <!-- 课程 -->
         <StSpace direction="vertical" gap="0.75rem" fill-x class="mt-4">
            <StSpace align="center" gap="0.5rem" fill-x>
               <School class="text-accent-200" size="1rem" :strokeWidth="3" />
               <span class="st-font-body-bold text-accent-100 flex-1">课程</span>
               <NuxtLink to="/app/publish/course">
                  <StButton size="sm" bordered>
                     <StSpace align="center" gap="0.375rem">
                        <Plus size="1rem" />
                        <span>创建课程</span>
                     </StSpace>
                  </StButton>
               </NuxtLink>
            </StSpace>

            <NuxtLink
               v-for="row in courseRows"
               :key="`course-${row.id}`"
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
               v-if="courseRows.length === 0"
               content="还没有课程"
               class="py-6" />
         </StSpace>

         <StSpace align="center" gap="0.5rem" fill-x class="mt-4">
            <NuxtLink
               to="/app/publish"
               class="st-font-caption text-accent-300 hover:text-secondary transition-colors flex items-center gap-1 flex-1">
               <FileEditingOne size="0.875rem" />
               返回发布流程
            </NuxtLink>
            <StButton size="sm" bordered @click="downloadBackup">
               <span>导出备份</span>
            </StButton>
            <StButton size="sm" bordered @click="restore">
               <span>恢复初始内容</span>
            </StButton>
         </StSpace>
      </StSpace>
   </StSpace>
</template>
