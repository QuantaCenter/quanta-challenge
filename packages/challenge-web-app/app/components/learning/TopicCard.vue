<script setup lang="ts">
import {
   topicProgress,
   useLearningCourse,
   type LearningTopic,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import { useLearningVisits } from '~/composables/use-learning-visits';

/** 专题卡片：封面 + 标题压在底部，悬浮时压暗并显示专题简介。 */
const content = useLearningContentStore();

const props = withDefaults(
   defineProps<{
      topic: LearningTopic;
      to?: string;
   }>(),
   { to: undefined },
);

const visits = useLearningVisits();
const state = computed(() =>
   topicProgress(
      props.topic,
      visits.slice.value,
      articlesOfTopic(props.topic, content.slice.value),
   ),
);
// 专题归属一门课程：右上角标出来，和文章卡片区分开
const courseName = computed(
   () => useLearningCourse(props.topic.courseId, content)?.name ?? '',
);
// 纯阅读专题没有题目、百分比恒为 0，用「已读 / 未读」表达才不矛盾
const badge = computed(() => {
   if (state.value.completed) return '已完成';
   if (state.value.isReadingOnly) return state.value.read ? '已读' : '未读';
   return state.value.percent > 0 ? `${state.value.percent}%` : undefined;
});
</script>

<template>
   <LearningCoverCard
      variant="topic"
      :title="topic.name"
      :description="topic.description"
      :preset="topic.coverPreset"
      :to="to"
      :badge="badge"
      :badge-color="state.completed ? '#a6fb1d' : '#434343'"
      :corner-label="courseName" />
</template>
