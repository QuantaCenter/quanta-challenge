<script setup lang="ts">
import { DocDetail, Left, Right } from '@icon-park/vue-next';
import {
   articleProgress,
   topicProgress,
   topicsOfArticle,
   useLearningArticle,
   useLearningTopic,
   type ContentBlock,
   type LearningArticle,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import {
   useLearningVisits,
   useMarkContentDone,
   useRecordVisit,
} from '~/composables/use-learning-visits';
import { toFavoriteArticle } from '~/composables/use-favorites';
import { articleContentItems } from '~/utils/learning-markdown';
import { renderInline, renderParagraph } from '~/utils/inline-markdown';

/**
 * 文章阅读器。
 *
 * 文章是**一等实体**（设计文档 §6.7）：它可以不属于任何专题，
 * 所以这个组件不要求专题上下文 —— 传了 `topicSlug` 就显示「专题面包屑 + 返回专题」，
 * 没传就按「独立文章」渲染（返回全部文章）。两种入口共用同一份渲染逻辑，
 * 避免"只有从专题点进来才看得到"这种把文章绑回专题的做法。
 */
const props = withDefaults(
   defineProps<{
      articleId: string | number;
      /** 所属专题（有上下文时传）：用于面包屑与「返回专题」 */
      topicSlug?: string | number;
      /** 没有任何专题引用它时（独立文章），是否显示"未被引用"的说明 */
      showStandaloneHint?: boolean;
   }>(),
   { topicSlug: undefined, showStandaloneHint: true },
);

const content = useLearningContentStore();
const visits = useLearningVisits();
const article = computed(() =>
   useLearningArticle(props.articleId, content),
);
const topic = computed(() =>
   props.topicSlug === undefined
      ? undefined
      : useLearningTopic(props.topicSlug, content),
);

/** 引用了这篇文章的全部专题（含当前这个） */
const ownerTopics = computed(() =>
   article.value ? topicsOfArticle(article.value.id, content) : [],
);

const state = computed(() =>
   article.value
      ? articleProgress(article.value, visits.slice.value)
      : undefined,
);

const items = computed(() =>
   article.value ? articleContentItems(article.value) : [],
);

// 「最近学习」靠这条记录（按 cuid 存，跨刷新保留）
useRecordVisit('article', () => article.value?.cuid);

// 达成完成时把这篇文章（以及它归属的专题）标成不可逆完成
useMarkContentDone({
   articleCuid: () => article.value?.cuid,
   articleDone: () => Boolean(state.value?.completed),
   topicCuids: () =>
      ownerTopics.value
         .map((item) => item.cuid)
         .filter((cuid): cuid is string => Boolean(cuid)),
   topicDone: (cuid) => {
      const item = ownerTopics.value.find((topic) => topic.cuid === cuid);
      if (!item) return false;
      const progress = topicProgress(
         item,
         visits.slice.value,
         articlesOfTopic(item, content.slice.value),
      );
      return progress.problemCount > 0 && progress.completed;
   },
});

const textOf = (block: ContentBlock) => ('text' in block ? block.text : '');
const itemsOf = (block: ContentBlock) => ('items' in block ? block.items : []);
const html = (text: string) => renderInline(text);
// 段落按 marked 的 breaks: true 渲染：段内换行 → <br>
const paragraphHtml = (text: string) => renderParagraph(text);

/** 返回目标：有专题上下文回专题，否则回全部文章 */
const backTo = computed(() =>
   topic.value ? `/app/topics/${topic.value.id}` : '/app/articles',
);
const backLabel = computed(() => (topic.value ? topic.value.name : '全部文章'));

useSeoMeta({
   title: computed(() =>
      article.value
         ? `${article.value.title}${topic.value ? ` - ${topic.value.name}` : ''} - Quanta Challenge`
         : '文章',
   ),
});

</script>

<template>
   <StEmptyStatus
      v-if="!article"
      content="没有这篇文章"
      class="pt-[10rem]" />

   <StSpace v-else fill-y direction="vertical" class="mt-6 w-[80rem] max-w-full">
      <StSpace align="center" gap="0.5rem" class="text-accent-300">
         <NuxtLink
            to="/app/articles"
            class="st-font-caption hover:text-secondary transition-colors">
            全部文章
         </NuxtLink>
         <template v-if="topic">
            <Right size="0.75rem" class="text-accent-400" />
            <NuxtLink
               :to="`/app/topics/${topic.id}`"
               class="st-font-caption hover:text-secondary transition-colors">
               {{ topic.name }}
            </NuxtLink>
         </template>
         <Right size="0.75rem" class="text-accent-400" />
         <span class="st-font-caption text-accent-100">
            {{ article.title }}
         </span>
      </StSpace>

      <StSpace
         align="start"
         justify="between"
         fill-x
         gap="2rem"
         class="mt-5 w-[65rem] max-w-full">
         <StSpace direction="vertical" gap="0.5rem" class="min-w-0">
            <StSpace align="center" gap="0.75rem">
               <DocDetail
                  class="text-secondary shrink-0"
                  size="1.75rem"
                  :strokeWidth="3" />
               <h1 class="text-[2rem] font-bold text-white">
                  {{ article.title }}
               </h1>
               <LearningFavoriteButton
                  kind="article"
                  :target="toFavoriteArticle(article)" />
            </StSpace>
            <p class="st-font-body-normal text-accent-300">
               {{ article.summary }}
            </p>
            <StSpace align="center" gap="0.5rem" class="flex-wrap">
               <template v-if="ownerTopics.length">
                  <span class="st-font-tooltip text-accent-400">
                     收录于
                  </span>
                  <NuxtLink
                     v-for="owner in ownerTopics"
                     :key="owner.id"
                     :to="`/app/topics/${owner.id}/${article.id}`"
                     class="st-font-tooltip text-secondary hover:opacity-75 transition-opacity">
                     {{ owner.name }}
                  </NuxtLink>
               </template>
               <span
                  v-else-if="showStandaloneHint"
                  class="st-font-tooltip text-accent-400">
                  独立文章：还没有专题收录它
               </span>
            </StSpace>
         </StSpace>

         <div class="shrink-0 w-[15rem] p-5 rounded-[1.25rem] bg-accent-600">
            <StSpace direction="vertical" gap="1rem" fill-x>
               <StSpace align="center" justify="between" fill-x>
                  <span class="st-font-body-bold text-accent-100">
                     本篇进度
                  </span>
                  <LearningStatusAction
                     :done="
                        !!(
                           state?.completed ||
                           (state?.isReadingOnly && state?.read)
                        )
                     "
                     size="sm" />
               </StSpace>
               <LearningProgressBar
                  v-if="state"
                  :progress="state.progress"
                  :percent="state.percent"
                  :completed="state.completed"
                  :is-reading-only="state.isReadingOnly"
                  :read="state.read" />
               <span
                  v-if="state && !state.isReadingOnly"
                  class="st-font-tooltip text-accent-400">
                  已完成 {{ state.done }} / {{ state.total }} 题
               </span>
            </StSpace>
         </div>
      </StSpace>

      <div class="w-full h-[1px] bg-accent-500 mt-8"></div>

      <article class="article-body mt-8 w-full min-w-0">
            <template v-for="(item, idx) in items" :key="idx">
               <LearningProblemBlock
                  v-if="item.kind === 'problem'"
                  :problem="item.problem"
                  :index="
                     items
                        .slice(0, idx + 1)
                        .filter((entry) => entry.kind === 'problem').length - 1
                  " />

               <h2
                  v-else-if="item.block.type === 'heading'"
                  class="text-[1.375rem] font-bold text-white mt-10 mb-4 first:mt-0"
                  v-html="html(textOf(item.block))" />

               <p
                  v-else-if="item.block.type === 'paragraph'"
                  class="st-font-body-normal text-accent-200 leading-[1.9] my-5 w-full"
                  v-html="paragraphHtml(textOf(item.block))" />

               <ul
                  v-else-if="item.block.type === 'list'"
                  class="my-5 pl-5 list-disc text-accent-200 st-font-body-normal leading-[1.9] space-y-2 w-full">
                  <li
                     v-for="(entry, i) in itemsOf(item.block)"
                     :key="i"
                     v-html="html(entry)" />
               </ul>

               <pre
                  v-else-if="item.block.type === 'code'"
                  class="my-6 p-5 rounded-[0.75rem] border border-accent-500 bg-simple-editor-background overflow-x-auto"><code
                  class="st-font-caption text-accent-100 font-family-mono">{{ textOf(item.block) }}</code></pre>

               <div
                  v-else-if="item.block.type === 'callout'"
                  class="my-6 p-4 rounded-[0.75rem] bg-warning/10 border-l-2 border-warning st-font-caption text-accent-200 leading-[1.8]"
                  v-html="html(textOf(item.block))" />
            </template>

         </article>

      <StSpace justify="end" align="center" fill-x class="mt-10">
         <NuxtLink :to="backTo">
            <StButton size="sm" bordered>
               <StSpace align="center" gap="0.375rem">
                  <Left size="0.875rem" />
                  <span>返回{{ topic ? '专题' : '全部文章' }}</span>
               </StSpace>
            </StButton>
         </NuxtLink>
      </StSpace>
   </StSpace>
</template>
