<script setup lang="ts">
import { Left } from '@icon-park/vue-next';
import {
   articlesOfCourse,
   courseProgress,
   courseTopics,
   useLearningCourses,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import { useLearningVisits } from '~/composables/use-learning-visits';

useSeoMeta({
   title: '课程 - Quanta Challenge',
   description: '课程是专题的集合：HTML / CSS / JavaScript …',
});

const content = useLearningContentStore();
const visits = useLearningVisits();

const rows = useLearningCourses().map((course) => ({
   course,
   progress: courseProgress(
      course,
      visits.slice.value,
      courseTopics(course.id, content.slice.value),
      articlesOfCourse(course.id, content.slice.value),
   ),
}));
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
            to="/app/topics"
            class="st-font-caption text-accent-300 hover:text-secondary transition-colors flex items-center gap-1">
            <Left size="0.875rem" />
            返回学习首页
         </NuxtLink>

         <StSpace align="end" gap="1rem" fill-x class="mt-4">
            <h1 class="text-[2.5rem] font-bold text-white">课程</h1>
            <span
               class="st-font-caption text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full">
               共 {{ rows.length }} 门
            </span>
         </StSpace>

         <StGrid fill-x :cols="4" gap="1rem" class="mt-6">
            <LearningCourseCard
               v-for="row in rows"
               :key="row.course.id"
               :course="row.course"
               :to="`/app/courses/${row.course.id}`" />
         </StGrid>

         <StSpacer fill flex no-shrink height="4rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
