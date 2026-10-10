<script setup lang="ts">
import {
   articleProgress,
   type LearningArticle,
} from '~/composables/use-learning';
import { useLearningVisits } from '~/composables/use-learning-visits';
import {
   toFavoriteArticle,
   type FavoriteArticle,
} from '~/composables/use-favorites';

/**
 * 文章卡片。传 `article` 时带进度；只传 `favorite` 时是收藏页里的快照。
 */
const props = withDefaults(
   defineProps<{
      article?: LearningArticle;
      favorite?: FavoriteArticle;
      to?: string;
      /** 覆盖默认摘要（例如补一句「也见于 …」） */
      description?: string;
   }>(),
   {
      article: undefined,
      favorite: undefined,
      to: undefined,
      description: undefined,
   },
);

const title = computed(
   () => props.article?.title ?? props.favorite?.title ?? '',
);
const summary = computed(
   () =>
      props.description ??
      props.article?.summary ??
      props.favorite?.summary ??
      '',
);
const preset = computed(
   () => props.article?.coverPreset ?? props.favorite?.coverPreset ?? null,
);
const url = computed(
   () => props.article?.coverUrl ?? props.favorite?.coverUrl ?? null,
);

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

const favoriteTarget = computed(() =>
   props.article ? toFavoriteArticle(props.article) : props.favorite,
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
      variant="article"
      favorite-kind="article"
      :favorite-target="favoriteTarget" />
</template>
