<script setup lang="ts">
import { Star } from '@icon-park/vue-next';
import {
   useFavorites,
   type FavoriteArticle,
   type FavoriteProblem,
} from '~/composables/use-favorites';

/**
 * 收藏按钮（题目 / 文章共用）。
 *
 * 传进来的是**收藏项本身**（`toFavoriteProblem` / `toFavoriteArticle` 的产物），
 * 所以收藏页里可以直接把已存的那一条再传回来，点一下就是取消收藏。
 */
const props = withDefaults(
   defineProps<{
      kind: 'problem' | 'article';
      target: FavoriteProblem | FavoriteArticle;
      size?: 'sm' | 'base';
      /** 浮在封面 / 卡片上时用：自带一层深色底，避免压在图上看不清 */
      raised?: boolean;
   }>(),
   { size: 'base', raised: false },
);

const favorites = useFavorites();

const asProblem = computed(() => props.target as FavoriteProblem);
const asArticle = computed(() => props.target as FavoriteArticle);

const active = computed(() =>
   props.kind === 'problem'
      ? favorites.isProblemFavorite(asProblem.value.key)
      : favorites.isArticleFavorite(asArticle.value.articleId),
);

// 卡片整块通常是链接，按钮必须自己吃掉这次点击
const toggle = (event: MouseEvent) => {
   event.preventDefault();
   event.stopPropagation();
   if (props.kind === 'problem') favorites.toggleProblem(asProblem.value);
   else favorites.toggleArticle(asArticle.value);
};

const iconSize = computed(() => (props.size === 'sm' ? '0.875rem' : '1.125rem'));
const boxClass = computed(() => (props.size === 'sm' ? 'size-6' : 'size-8'));
</script>

<template>
   <button
      type="button"
      :title="active ? '取消收藏' : '收藏'"
      :aria-label="active ? '取消收藏' : '收藏'"
      :aria-pressed="active"
      class="flex items-center justify-center rounded-full transition-colors"
      :class="[
         boxClass,
         raised
            ? 'bg-background/55 backdrop-blur-xs hover:bg-background/80'
            : 'hover:bg-accent-500',
      ]"
      @click="toggle">
      <Star
         theme="two-tone"
         :size="iconSize"
         :strokeWidth="3"
         :fill="active ? ['#a6fb1d', '#a6fb1d'] : ['#bdbdbd', 'transparent']" />
   </button>
</template>
