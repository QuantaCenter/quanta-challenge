<script setup lang="ts">
import ArticlePublicationForm from './_modules/ArticlePublicationForm.vue';

useSeoMeta({
   title: '发布文章 - Quanta Challenge',
   description: '写一篇新的文章；文章独立于专题存在，可被多个专题引用。',
});
</script>

<template>
   <ArticlePublicationForm mode="create" />
</template>
