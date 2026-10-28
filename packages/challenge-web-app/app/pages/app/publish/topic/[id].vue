<script setup lang="ts">
import LearningTopicEditor from '~/components/learning-admin/LearningTopicEditor.vue';

const route = useRoute();
const topicId = computed(() => String(route.params.id));
</script>

<template>
   <LearningTopicEditor :topic-id="topicId" />
</template>
