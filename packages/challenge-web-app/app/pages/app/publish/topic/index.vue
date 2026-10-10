<script setup lang="ts">
import TopicForm from './_modules/TopicForm.vue';

useSeoMeta({
   title: '创建专题 - Quanta Challenge',
   description: '专题引用文章：把若干篇文章组织成一个知识领域，例如「布局」。',
});
</script>

<template>
   <TopicForm mode="create" />
</template>
