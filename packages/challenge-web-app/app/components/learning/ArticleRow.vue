<script setup lang="ts">
import dayjs from 'dayjs';
import { CheckOne, DocDetail, Round } from '@icon-park/vue-next';
import { NuxtLink } from '#components';
import { articleProgress } from '~/utils/learning-progress';
import {
   topicsOfArticle,
   type LearningArticle,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import { useLearningVisits } from '~/composables/use-learning-visits';

/**
 * 文章条状列表项：左封面、右标题 + 摘要 + 信息。
 * 与 `LearningArticleCard` 共用数据，只是排布不同。
 * 传 `to` 时渲染成链接（列表页用）；不传时渲染成普通块
 * （选题抽屉用，点击行为交给外层容器）。
 */
const props = withDefaults(
   defineProps<{
      article?: LearningArticle;
      to?: string;
      /** 传 `to` 时是否在下方渲染分隔线（默认渲染） */
      divider?: boolean;
   }>(),
   {
      article: undefined,
      to: undefined,
      divider: true,
   },
);

const title = computed(() => props.article?.title ?? '');

// 简介直接取正文：方块拼成纯文本、去掉行内标记，超出交给 line-clamp 省略
const toPlainText = (text: string): string =>
   text
      .replace(/<ArticleText\s+size="[^"]*">|<\/ArticleText>/g, '')
      .replace(/<Problem\s+baseId=\{\d+\}\s*\/>/g, '')
      .replace(/@@problem:\d+@@/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

const bodyExcerpt = computed(() => {
   const article = props.article;
   if (!article) return '';
   return article.content
      .map((block) => {
         if (block.type === 'list') return block.items.map(toPlainText).join(' ');
         if (block.type === 'code') return '';
         return toPlainText(block.text);
      })
      .filter((text) => text.length > 0)
      .join(' ');
});

const summary = computed(() =>
   props.article ? bodyExcerpt.value || props.article.summary : '',
);
const preset = computed(() => props.article?.coverPreset ?? null);
const url = computed(() => props.article?.coverUrl ?? null);

const content = useLearningContentStore();
const tags = computed(() =>
   (props.article ? topicsOfArticle(props.article.id, content) : []).slice(0, 3),
);
const publishDate = computed(() =>
   props.article?.createdAt
      ? dayjs(props.article.createdAt).format('YYYY-MM-DD')
      : '',
);
const authorName = computed(() => props.article?.authorName ?? '匿名');
const authorAvatarUrl = computed(
   () => props.article?.authorAvatarUrl ?? undefined,
);

const visits = useLearningVisits();
const state = computed(() =>
   props.article ? articleProgress(props.article, visits.slice.value) : null,
);

const problemCount = computed(() => props.article?.problems.length ?? 0);

const done = computed(() =>
   Boolean(
      state.value &&
         (state.value.completed ||
            (state.value.isReadingOnly && state.value.read)),
   ),
);
</script>

<template>
   <component
      :is="to ? NuxtLink : 'div'"
      :to="to"
      class="group flex w-full items-stretch gap-4 py-4">
      <div
         class="relative w-[14rem] h-[8.75rem] shrink-0 overflow-hidden rounded-[0.375rem] ring-1 ring-white/5">
         <div class="size-full transition-transform duration-300 group-hover:scale-[1.03]">
            <LearningArticleCover
               :preset="preset"
               :url="url"
               height="100%"
               icon-size="2.5rem" />
         </div>
         <div
            class="absolute inset-0 bg-background/5 transition-colors group-hover:bg-background/20" />
      </div>

      <div class="flex min-w-0 flex-1 flex-col justify-between gap-2">
         <div class="flex flex-col gap-2">
            <div class="flex items-start gap-3">
               <h3
                  class="min-w-0 flex-1 text-[1.25rem] font-bold leading-snug text-white line-clamp-1 transition-colors group-hover:text-secondary">
                  {{ title }}
               </h3>
            </div>

            <p class="st-font-caption text-accent-400 leading-normal line-clamp-3 text-justify transition-colors group-hover:text-accent-300">
               {{ summary }}
            </p>
         </div>

         <div class="flex items-center gap-2 st-font-caption text-accent-400">
            <div v-if="state" class="flex shrink-0 items-center">
               <CheckOne
                  v-if="done"
                  class="text-success"
                  size="0.875rem"
                  :strokeWidth="3" />
               <Round
                  v-else
                  class="text-accent-400"
                  size="0.875rem"
                  :strokeWidth="3" />
            </div>

            <div
               v-if="tags.length"
               class="flex min-w-0 items-center gap-1.5 overflow-hidden">
               <StTag
                  v-for="tag in tags"
                  :key="tag.id"
                  size="small"
                  color="#434343"
                  :content="tag.name"
                  class="shrink-0" />
            </div>

            <span
               v-if="problemCount"
               class="flex shrink-0 items-center gap-1">
               <DocDetail size="0.875rem" />
               {{ problemCount }} 道题
            </span>

            <div
               v-if="article && publishDate"
               class="ml-auto flex shrink-0 items-center gap-1.5">
               <span class="font-family-manrope">{{ publishDate }}</span>
               <span class="text-accent-500">·</span>
               <StAvatar :url="authorAvatarUrl" size="1rem" />
               <span class="max-w-[8rem] truncate">{{ authorName }}</span>
            </div>
         </div>
      </div>
   </component>

   <StDivider v-if="to && divider" simple class="last:hidden opacity-30" />
</template>
