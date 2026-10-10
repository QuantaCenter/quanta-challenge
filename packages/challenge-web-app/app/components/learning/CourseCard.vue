<script setup lang="ts">
import {
   articlesOfCourse,
   courseProgress,
   courseTopics,
   type LearningCourse,
} from '~/composables/use-learning';
import { useLearningVisits } from '~/composables/use-learning-visits';
import { useLearningContentStore } from '~/composables/use-learning-store';

/** 课程卡片：封面 + 标题压在底部，悬浮时压暗并显示课程简介。 */
const props = withDefaults(
   defineProps<{
      course: LearningCourse;
      to?: string;
      /** 待审 / 草稿的课程在创作侧要能一眼看出来 */
      showStatus?: boolean;
   }>(),
   { to: undefined, showStatus: false },
);

const content = useLearningContentStore();
const visits = useLearningVisits();
const state = computed(() =>
   courseProgress(
      props.course,
      visits.slice.value,
      courseTopics(props.course.id, content.slice.value),
      articlesOfCourse(props.course.id, content.slice.value),
   ),
);
const badge = computed(() => {
   // 顺序很重要：先判完成，再判纯阅读，最后才给百分比。
   // 纯阅读课程没有题、百分比恒为 0，用「已读 / 未读」表达才不矛盾。
   if (state.value.completed) return '已完成';
   if (state.value.isReadingOnly) return state.value.read ? '已读' : '未读';
   if (state.value.lastOpenedAt === null) return '未开始';
   return `${state.value.percent}%`;
});

// 学习侧只列已上架课程，所以状态文案只在发布页出现
const statusText = computed(() => {
   if (props.course.status === 'published') return '已上架';
   if (props.course.status === 'pending') return '待审核';
   return '草稿';
});
</script>

<template>
   <div class="relative">
      <LearningCoverCard
         variant="course"
         :title="course.name"
         :description="course.description"
         :preset="course.coverPreset"
         :to="to"
         :badge="badge"
         :badge-color="state.completed ? '#a6fb1d' : '#434343'"
         />
      <StTag
         v-if="showStatus"
         size="small"
         class="absolute top-2 left-2 z-10"
         :color="course.status === 'published' ? '#a6fb1d' : '#ffbe31'"
         :content="statusText" />
   </div>
</template>
