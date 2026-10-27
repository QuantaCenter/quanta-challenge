<script setup lang="ts">
/** 独立文章页：不带专题上下文也能打开 */
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
      class="hide-scrollbar">
      <LearningArticleReader :article-id="articleId" />
   </StSpace>
</template>
