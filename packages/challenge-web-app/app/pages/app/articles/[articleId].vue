<script setup lang="ts">
/**
 * 独立文章页：不带专题上下文也能打开。
 *
 * 文章是一等实体（§6.7），地址形态必须支持「不属于任何专题」这一情况；
 * 带专题上下文的读法仍然可用：`/app/topics/:topicId/:articleId`（保留兼容）。
 */
const route = useRoute();
const articleId = computed(() => String(route.params.articleId));

useSeoMeta({ title: '文章 - Quanta Challenge' });
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      align="center"
      gap="0"
      class="hide-scrollbar overflow-auto">
      <LearningArticleReader :article-id="articleId" />
   </StSpace>
</template>
