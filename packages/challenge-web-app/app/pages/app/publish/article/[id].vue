<script setup lang="ts">
import LearningArticleEditor from '~/components/learning-admin/LearningArticleEditor.vue';

const route = useRoute();
const articleId = computed(() => String(route.params.id));
</script>

<template>
   <LearningArticleEditor :article-id="articleId" />
</template>
