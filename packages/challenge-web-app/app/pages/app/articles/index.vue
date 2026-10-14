<script setup lang="ts">
import { Left } from '@icon-park/vue-next';
import { useLearningArticles } from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';

/**
 * 全部文章：文章是一等实体，这里不经过专题就能进。
 * 与学习首页的「全站文章」栏是同一份数据，只是给了一个独立入口。
 */
const content = useLearningContentStore();
const allArticles = useLearningArticles(content);
const { items: articles, sentinelRef } = usePagedList(allArticles, 10);

useSeoMeta({
   title: '文章 - Quanta Challenge',
   description: '文章独立于专题存在，可以不属于任何专题。',
});
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      align="center"
      gap="0"
      class="hide-scrollbar overflow-auto">
      <StSpace fill-y direction="vertical" class="mt-6 w-[65rem]">
         <NuxtLink
            to="/app/learning"
            class="st-font-caption text-accent-300 hover:text-secondary transition-colors flex items-center gap-1">
            <Left size="0.875rem" />
            返回学习首页
         </NuxtLink>

         <h1 class="mt-4 text-[2.5rem] font-bold text-white">文章</h1>

         <StSpace direction="vertical" gap="0" fill-x class="mt-6">
            <LearningArticleRow
               v-for="article in articles"
               :key="article.id"
               :article="article"
               :to="`/app/articles/${article.id}`" />
         </StSpace>

         <div ref="sentinelRef" class="h-1 w-full shrink-0"></div>

         <StSpacer fill flex no-shrink height="4rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
