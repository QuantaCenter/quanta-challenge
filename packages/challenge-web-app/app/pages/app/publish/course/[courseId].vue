<script setup lang="ts">
import CourseForm from './_modules/CourseForm.vue';

const route = useRoute();
const courseId = computed(() => String(route.params.courseId));

useSeoMeta({
   title: computed(() => `编辑课程 ${courseId.value} - Quanta Challenge`),
});
</script>

<template>
   <CourseForm mode="edit" :course-id="courseId" />
</template>
