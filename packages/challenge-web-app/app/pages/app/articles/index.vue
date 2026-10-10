<script setup lang="ts">
import { DocDetail, Left } from '@icon-park/vue-next';
import {
   topicsOfArticle,
   useLearningArticles,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';

/**
 * 全部文章：文章是一等实体，这里不经过专题就能进。
 * 与学习首页的「全站文章」栏是同一份数据，只是给了一个独立入口。
 */
const content = useLearningContentStore();
const articles = useLearningArticles(content);

const rows = computed(() =>
   articles.map((article) => ({
      article,
      owners: topicsOfArticle(article.id, content),
   })),
);

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
            to="/app/topics"
            class="st-font-caption text-accent-300 hover:text-secondary transition-colors flex items-center gap-1">
            <Left size="0.875rem" />
            返回学习首页
         </NuxtLink>

         <StSpace align="end" gap="1rem" fill-x class="mt-4">
            <h1 class="text-[2.5rem] font-bold text-white">文章</h1>
            <span
               class="st-font-caption text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full">
               共 {{ rows.length }} 篇
            </span>
         </StSpace>

         <StSpace align="center" gap="0.5rem" fill-x class="mt-4">
            <DocDetail class="shrink-0 text-accent-300" size="1rem" :strokeWidth="3" />
            <span class="st-font-tooltip text-accent-400">
               文章不依赖专题：没有被任何专题收录也能打开
            </span>
         </StSpace>

         <StGrid fill-x :cols="3" gap="1rem" class="mt-6">
            <LearningArticleCard
               v-for="row in rows"
               :key="row.article.id"
               :article="row.article"
               :to="`/app/articles/${row.article.id}`"
               :description="
                  row.owners.length
                     ? `收录于 ${row.owners.map((t) => t.name).join(' · ')}`
                     : row.article.summary
               " />
         </StGrid>

         <StSpacer fill flex no-shrink height="4rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
