<script setup lang="ts">
import TopicForm from './_modules/TopicForm.vue';

const route = useRoute();
const topicId = computed(() => String(route.params.topicId));

useSeoMeta({
   title: computed(() => `编辑专题 ${topicId.value} - Quanta Challenge`),
});
</script>

<template>
   <TopicForm mode="edit" :topic-id="topicId" />
</template>
