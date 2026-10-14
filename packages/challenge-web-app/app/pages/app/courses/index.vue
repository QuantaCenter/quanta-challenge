<script setup lang="ts">
import { Left } from '@icon-park/vue-next';
import { useLearningCourses } from '~/composables/use-learning';

useSeoMeta({
   title: '课程 - Quanta Challenge',
   description: '课程是专题的集合：HTML / CSS / JavaScript …',
});

const courses = useLearningCourses();
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      align="center"
      gap="0"
      class="hide-scrollbar overflow-auto">
      <StSpace fill-y direction="vertical" class="mt-6 w-[65rem]">
         <NuxtLink
            to="/app/learning"
            class="st-font-caption text-accent-300 hover:text-secondary transition-colors flex items-center gap-1">
            <Left size="0.875rem" />
            返回学习首页
         </NuxtLink>

         <h1 class="mt-4 text-[2.5rem] font-bold text-white">课程</h1>

         <StGrid fill-x :cols="4" gap="1rem" class="mt-6">
            <LearningCourseCard
               v-for="course in courses"
               :key="course.id"
               :course="course"
               :to="`/app/courses/${course.id}`" />
         </StGrid>

         <StSpacer fill flex no-shrink height="4rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
