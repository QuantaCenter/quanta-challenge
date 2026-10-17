<script setup lang="ts">
const route = useRoute();
const topicId = computed(() => String(route.params.topicId));
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
      <LearningArticleReader
         :article-id="articleId"
         :topic-id="topicId" />
   </StSpace>
</template>
