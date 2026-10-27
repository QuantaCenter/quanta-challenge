<script setup lang="ts">
import { articleProgress } from '~/utils/learning-progress';
import {
   type LearningArticle,
} from '~/composables/use-learning';
import { useLearningVisits } from '~/composables/use-learning-visits';

/**
 * 文章卡片。
 */
const props = withDefaults(
   defineProps<{
      article?: LearningArticle;
      to?: string;
      /** 覆盖默认摘要（例如补一句「也见于 …」） */
      description?: string;
   }>(),
   {
      article: undefined,
      to: undefined,
      description: undefined,
   },
);

const title = computed(() => props.article?.title ?? '');
const summary = computed(() => props.description ?? props.article?.summary ?? '');
const preset = computed(() => props.article?.coverPreset ?? null);
const url = computed(() => props.article?.coverUrl ?? null);

const visits = useLearningVisits();
const state = computed(() =>
   props.article ? articleProgress(props.article, visits.slice.value) : null,
);

// 只留一个必要标签：纯阅读 / 已读 / 进度
const badge = computed(() => {
   if (!state.value) return undefined;
   if (state.value.isReadingOnly) return state.value.read ? '已读' : '纯阅读';
   return `${state.value.percent}%`;
});

const badgeColor = computed(() =>
   state.value?.completed || (state.value?.isReadingOnly && state.value?.read)
      ? '#a6fb1d'
      : '#434343',
);
</script>

<template>
   <LearningCoverCard
      :title="title"
      :description="summary"
      :preset="preset"
      :url="url"
      :to="to"
      :badge="badge"
      :badge-color="badgeColor"
      variant="article" />
</template>
