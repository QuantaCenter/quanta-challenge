<script setup lang="ts">
import { Left, Plus, Right } from '@icon-park/vue-next';
import {
   topicsOfArticle,
   useLearningArticles,
} from '~/composables/use-learning';

useSeoMeta({
   title: '文章 - Quanta Challenge',
   description: '文章独立于专题存在，可被多个专题引用。',
});

const content = useLearningContentStore();

const rows = computed(() =>
   // 包一层 computed：发布/编辑文章后 store 里的数组会换引用，列表要跟着更新
   useLearningArticles(content).map((article) => ({
      article,
      problemCount: article.problems.filter((problem) => !problem.unavailable)
         .length,
      ownerTopics: topicsOfArticle(article.id, content).map(
         (topic) => topic.name,
      ),
   })),
);
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-[46rem] pb-[10rem] my-6">
         <StSpace align="end" gap="1rem" fill-x>
            <h1 class="st-font-hero-bold">文章</h1>
            <NuxtLink
               to="/app/publish/article/new"
               class="ml-auto shrink-0 mb-2">
               <StButton>
                  <StSpace align="center" gap="0.375rem">
                     <Plus size="1.25rem" />
                     <span>写新文章</span>
                  </StSpace>
               </StButton>
            </NuxtLink>
         </StSpace>

         <StSpace direction="vertical" gap="1rem" fill-x>
            <NuxtLink
               v-for="row in rows"
               :key="row.article.id"
               :to="`/app/publish/article/${row.article.id}`"
               class="w-full">
               <div
                  class="group w-full p-3 rounded-[1rem] bg-accent-600 border border-transparent hover:border-secondary/50 transition-all flex items-center gap-4">
                  <LearningArticleCover
                     :preset="row.article.coverPreset"
                     :url="row.article.coverUrl"
                     height="4.5rem"
                     icon-size="2rem"
                     class="shrink-0 w-[7.5rem]" />

                  <StSpace
                     direction="vertical"
                     gap="0.5rem"
                     class="min-w-0 flex-1">
                     <StSpace align="center" gap="0.5rem">
                        <span
                           class="st-font-body-bold text-accent-100 truncate">
                           {{ row.article.title }}
                        </span>
                        <StTag
                           v-if="row.problemCount === 0"
                           size="small"
                           color="#434343"
                           content="纯阅读" />
                     </StSpace>
                     <span class="st-font-caption text-accent-300 truncate">
                        {{ row.article.summary }}
                     </span>
                     <span class="st-font-tooltip text-accent-400 truncate">
                        {{
                           row.ownerTopics.length
                              ? `已被 ${row.ownerTopics.join(' · ')} 引用`
                              : '还没有专题引用它'
                        }}
                     </span>
                  </StSpace>

                  <span
                     class="shrink-0 st-font-tooltip text-accent-300 font-family-manrope px-3 py-1 rounded-full bg-accent-500/60">
                     {{ row.problemCount }} 题
                  </span>

                  <Right
                     class="shrink-0 text-accent-400 group-hover:text-secondary group-hover:translate-x-0.5 transition-all" />
               </div>
            </NuxtLink>

            <StEmptyStatus
               v-if="rows.length === 0"
               content="内容库里还没有文章"
               class="py-10" />
         </StSpace>

         <NuxtLink
            to="/app/publish"
            class="st-font-caption text-accent-300 hover:text-secondary transition-colors flex items-center gap-1">
            <Left size="0.875rem" />
            返回发布流程
         </NuxtLink>
      </StSpace>
   </StSpace>
</template>
