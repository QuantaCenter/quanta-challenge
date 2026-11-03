<script setup lang="ts">
import CourseDirectory from './CourseDirectory.vue';
import type { DirectoryChapter } from '~/types/course-directory';

defineProps<{ chapter: DirectoryChapter }>();
const emit = defineEmits<{ select: [sectionId: string] }>();
</script>

<template>
   <section class="w-full rounded-xl border border-accent-500 p-5" aria-label="本章目录">
      <h2 class="mb-4 text-lg font-medium">本章目录</h2>
      <CourseDirectory
         v-if="chapter.sections.length"
         :chapters="[chapter]"
         interactive
         item-padding-right="0.75em"
         :show-chapter-header="false"
         @section="emit('select', $event)" />
      <p v-else class="text-sm text-accent-300">本章暂无学习内容。</p>
   </section>
</template>
