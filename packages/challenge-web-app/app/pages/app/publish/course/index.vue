<script setup lang="ts">
import CourseForm from './_modules/CourseForm.vue';

useSeoMeta({
   title: '创建课程 - Quanta Challenge',
   description: '课程集合专题：把若干专题编成一门可完整学完的课程，例如「CSS」。',
});
</script>

<template>
   <CourseForm mode="create" />
</template>
