<script setup lang="ts">
import { Attention, CheckOne } from '@icon-park/vue-next';
import type { AdminCourseDetail, CourseStatus } from '~/types/course-admin';

/** 发布检查结果：未通过时列出待完善项，已发布课程出现问题时提示会卡住学员。 */
const props = defineProps<{
   issues: AdminCourseDetail['issues'];
   status: CourseStatus;
}>();

const expanded = ref(false);
const visibleIssues = computed(() => (expanded.value ? props.issues : props.issues.slice(0, 4)));
</script>

<template>
   <section
      v-if="issues.length"
      class="w-full rounded-2xl border border-warning/40 bg-warning/5 p-5 max-md:p-4">
      <StSpace align="center" gap="0.625rem">
         <Attention class="text-[1.25rem] text-warning" />
         <h2 class="st-font-body-bold text-warning">
            {{ status === 'published' ? `已发布的课程存在 ${issues.length} 个问题` : `发布前还需完善 ${issues.length} 项` }}
         </h2>
      </StSpace>
      <p v-if="status === 'published'" class="mt-1 st-font-caption text-accent-300">
         空阶段或缺少内容的小节会让学员无法继续解锁后续内容，请尽快补全或先下架课程。
      </p>
      <ul class="mt-3 flex flex-col gap-1.5">
         <li
            v-for="(issue, index) in visibleIssues"
            :key="index"
            class="flex items-start gap-2 st-font-caption text-accent-200">
            <span class="mt-[0.45rem] size-1 shrink-0 rounded-full bg-warning" />
            <span>{{ issue.message }}</span>
         </li>
      </ul>
      <StTextButton
         v-if="issues.length > 4"
         class="mt-2"
         :text="expanded ? '收起' : `展开全部 ${issues.length} 项`"
         @click="expanded = !expanded" />
   </section>

   <section
      v-else
      class="flex w-full items-center gap-2.5 rounded-2xl border border-success/30 bg-success/5 px-5 py-4 max-md:px-4">
      <CheckOne class="text-[1.25rem] text-success" />
      <span class="st-font-body-normal text-success">
         {{ status === 'published' ? '课程内容完整，学员可正常学习' : '发布检查已通过，可以发布课程' }}
      </span>
   </section>
</template>
