<script setup lang="ts">
import { COURSE_STATUS_META, type CourseStatus } from '~/types/course-admin';

const props = defineProps<{
   status: CourseStatus;
}>();

const meta = computed(() => COURSE_STATUS_META[props.status]);
</script>

<template>
   <span
      class="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 st-font-caption leading-5"
      :class="meta.badgeClass">
      <span class="size-1.5 rounded-full" :class="meta.dotClass" />
      {{ meta.label }}
   </span>
</template>
