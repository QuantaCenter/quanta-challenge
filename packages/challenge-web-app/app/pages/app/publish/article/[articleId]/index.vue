<script setup lang="ts">
import ArticlePublicationForm from '../_modules/ArticlePublicationForm.vue';

const route = useRoute();
const articleId = computed(() => String(route.params.articleId));

useSeoMeta({
   title: computed(() => `编辑文章 ${articleId.value} - Quanta Challenge`),
});
</script>

<template>
   <ArticlePublicationForm mode="edit" :article-id="articleId" />
</template>
