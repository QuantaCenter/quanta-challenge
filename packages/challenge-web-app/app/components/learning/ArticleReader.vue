<script setup lang="ts">
import dayjs from 'dayjs';
import { BookOne, Calendar, DocDetail, Right } from '@icon-park/vue-next';
import { articleProgress, topicProgress } from '~/utils/learning-progress';
import {
   articlesOfTopic,
   topicsOfArticle,
   useLearningArticle,
   useLearningArticles,
   useLearningTopic,
   type LearningProblemRef,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';import {
   useLearningVisits,
   useMarkContentDone,
   useRecordVisit,
} from '~/composables/use-learning-visits';
import {
   PROBLEM_DIRECTIVE_PATTERN,
   renderArticleSource,
} from '~/utils/learning-markdown';
import { ARTICLE_TEXT_SIZE_CLASS } from '~/utils/inline-markdown';
import { useMarkdown } from '~/composables/use-markdown';

/**
 * 文章阅读器，正文中的题目指令渲染为题目块。
 */
const props = withDefaults(
   defineProps<{
      articleId: string | number;
      /** 所属专题 id，用于面包屑与返回 */
      topicId?: string | number;
      /** 独立文章是否显示未被引用说明 */
      showStandaloneHint?: boolean;
   }>(),
   { topicId: undefined, showStandaloneHint: true },
);

const content = useLearningContentStore();
const allArticles = useLearningArticles(content);
const visits = useLearningVisits();
const article = computed(() =>
   useLearningArticle(props.articleId, content),
);
const topic = computed(() =>
   props.topicId === undefined
      ? undefined
      : useLearningTopic(props.topicId, content),
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

const authorName = computed(() => article.value?.authorName ?? '匿名');
const authorAvatarUrl = computed(
   () => article.value?.authorAvatarUrl ?? undefined,
);
const publishDate = computed(() =>
   article.value?.createdAt
      ? dayjs(article.value.createdAt).format('YYYY-MM-DD')
      : '',
);
const topicNames = computed(() =>
   ownerTopics.value.map((item) => item.name).join(' · '),
);
const hasAuthor = computed(() => Boolean(article.value?.authorName));
const authorArticleCount = computed(() => {
   const name = article.value?.authorName;
   if (!name) return 0;
   return allArticles.filter((item) => item.authorName === name).length;
});

// 最近学习靠这条记录
useRecordVisit('article', () => article.value?.cuid);

// 达成完成时把文章与所属专题标为不可逆完成
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
         articlesOfTopic(item, content),
      );
      return progress.problemCount > 0 && progress.completed;
   },
});

const PROBLEM_SLOT = '<!--learning-problem-slot-->';
const ARTICLE_TEXT_PATTERN =
   /<ArticleText size="(sm|base|lg)">([\s\S]*?)<\/ArticleText>/g;

const markdownSource = computed(() => {
   if (!article.value) return '';
   const source = article.value.source ?? renderArticleSource(article.value);
   return source
      .replace(PROBLEM_DIRECTIVE_PATTERN, `\n\n${PROBLEM_SLOT}\n\n`)
      .replace(ARTICLE_TEXT_PATTERN, (_match, size: string, inner: string) => {
         const cls = ARTICLE_TEXT_SIZE_CLASS[size] ?? ARTICLE_TEXT_SIZE_CLASS.base;
         return `<span class="${cls}">${inner}</span>`;
      });
});

const { html: bodyHtml, update } = useMarkdown({ codeHeader: true });
// setup 阶段先渲染一次，SSR 直出正文
update(markdownSource.value);
// 客户端挂载后再渲一次以启用 shiki 高亮
onMounted(() => {
   update(markdownSource.value);
});
watch(markdownSource, (value) => {
   update(value);
});

type BodySegment =
   | { kind: 'html'; html: string }
   | { kind: 'problem'; problem: LearningProblemRef };

const segments = computed<BodySegment[]>(() => {
   const problems = article.value?.problems ?? [];
   const parts = bodyHtml.value.split(PROBLEM_SLOT);
   const result: BodySegment[] = [];
   parts.forEach((part, index) => {
      if (part.trim()) result.push({ kind: 'html', html: part });
      const problem = problems[index];
      if (index < parts.length - 1 && problem) {
         result.push({ kind: 'problem', problem });
      }
   });
   return result;
});

/** 返回目标：有专题上下文回专题，否则回全部文章 */
const backTo = computed(() =>
   topic.value ? `/app/learning/${topic.value.id}` : '/app/articles',
);

useSeoMeta({
   title: computed(() =>
      article.value
         ? `${article.value.title}${topic.value ? ` - ${topic.value.name}` : ''} - Quanta Challenge`
         : '文章',
   ),
});
</script>

<template>
   <StEmptyStatus v-if="!article" content="没有这篇文章" class="pt-[10rem]" />

   <StSpace v-else fill-y direction="vertical" class="mt-6 w-[65rem] max-w-full">
      <StSpace align="center" gap="0.5rem" fill-x class="text-accent-300">
         <NuxtLink
            to="/app/articles"
            class="shrink-0 st-font-caption hover:text-secondary transition-colors">
            全部文章
         </NuxtLink>
         <template v-if="topic">
            <Right size="0.75rem" class="shrink-0 text-accent-400" />
            <NuxtLink
               :to="`/app/learning/${topic.id}`"
               class="shrink-0 st-font-caption hover:text-secondary transition-colors">
               {{ topic.name }}
            </NuxtLink>
         </template>
         <Right size="0.75rem" class="shrink-0 text-accent-400" />
         <span class="min-w-0 truncate st-font-caption text-accent-100">
            {{ article.title }}
         </span>
      </StSpace>

      <h1
         class="mt-6 w-full text-center text-[2.5rem] font-bold leading-tight text-white">
         {{ article.title }}
      </h1>
      <p class="w-full text-center st-font-body-normal text-accent-300">
         {{ article.summary }}
      </p>

      <div class="mt-4 w-full overflow-hidden rounded-[0.5rem]">
         <LearningArticleCover
            :preset="article.coverPreset ?? null"
            :url="article.coverUrl ?? null"
            height="20rem"
            icon-size="6rem" />
      </div>

      <div class="mt-8 grid w-full grid-cols-[1fr_13rem] gap-6">
         <!-- 左：正文 -->
         <article class="min-w-0">
            <template v-for="(segment, index) in segments" :key="index">
               <LearningProblemBlock
                  v-if="segment.kind === 'problem'"
                  :problem="segment.problem" />
               <LearningArticleBody v-else :html="segment.html" />
            </template>
         </article>

         <!-- 右：作者信息卡 -->
         <aside class="sticky top-[5.75rem] min-w-0 self-start">
            <div class="flex flex-col gap-4">
               <div class="flex items-center gap-3">
                  <StAvatar :url="authorAvatarUrl" size="3rem" />
                  <div class="flex min-w-0 flex-col gap-0.5">
                     <span class="st-font-body-bold truncate text-white">
                        {{ authorName }}
                     </span>
                     <span class="st-font-caption text-accent-400">作者</span>
                  </div>
               </div>

               <div class="h-[1px] w-full bg-accent-500" />

               <StSpace
                  direction="vertical"
                  gap="0.75rem"
                  fill-x
                  class="st-font-body-normal">
                  <StSpace v-if="hasAuthor" align="center" gap="6px">
                     <DocDetail
                        class="shrink-0 text-accent-200"
                        :strokeWidth="3"
                        :size="20" />
                     <span class="shrink-0 text-accent-200">发文数量：</span>
                     <span>{{ authorArticleCount }} 篇</span>
                  </StSpace>

                  <StSpace v-if="ownerTopics.length" align="center" gap="6px">
                     <BookOne
                        class="shrink-0 text-accent-200"
                        :strokeWidth="3"
                        :size="20" />
                     <span class="shrink-0 text-accent-200">收录专题：</span>
                     <span class="min-w-0 truncate">{{ topicNames }}</span>
                  </StSpace>

                  <StSpace v-if="publishDate" align="center" gap="6px">
                     <Calendar
                        class="shrink-0 text-accent-200"
                        :strokeWidth="3"
                        :size="20" />
                     <span class="shrink-0 text-accent-200">发布时间：</span>
                     <span class="min-w-0 truncate">{{ publishDate }}</span>
                  </StSpace>
               </StSpace>
            </div>
         </aside>
      </div>

      <StSpacer fill flex no-shrink height="4rem" />

      <!-- 右下角悬浮操作：点赞 / 收藏 / 返回 -->
      <LearningArticleActions
         v-if="article"
         :article="article"
         :back-to="backTo" />
   </StSpace>
</template>
