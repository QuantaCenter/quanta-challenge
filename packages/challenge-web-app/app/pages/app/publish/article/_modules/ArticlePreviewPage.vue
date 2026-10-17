<script setup lang="ts">
import { BookOne, Calendar, DocDetail, Left } from '@icon-park/vue-next';
import type {
   ArticleCoverPreset,
   LearningProblemRef,
} from '~/composables/use-learning';
import { PROBLEM_DIRECTIVE_PATTERN } from '~/utils/learning-markdown';
import { ARTICLE_TEXT_SIZE_CLASS } from '~/utils/inline-markdown';
import { useMarkdown } from '~/composables/use-markdown';

/**
 * 文章发布页的整页预览：布局与文章详情页（LearningArticleReader）一致，
 * 但数据全部来自当前表单草稿——只存在本地，不记录浏览、不上服务器。
 * 顶部用「返回编辑 + 本地预览」一行替代文章页的面包屑，其余结构照搬。
 */
const props = defineProps<{
   title: string;
   summary: string;
   body: string;
   coverPreset?: ArticleCoverPreset;
   coverUrl?: string;
   /** 题库：正文里写到的任何题号都从这里取标题 / 难度 / 分值 */
   bank: LearningProblemRef[];
   authorName?: string;
   authorAvatarUrl?: string | null;
   authorArticleCount?: number;
   /** 收录这篇文章的专题名（用 · 连接）；还没有专题引用时留空 */
   topicNames?: string;
   publishDate?: string;
}>();

const emit = defineEmits<{ back: [] }>();

const PROBLEM_SLOT = '<!--learning-problem-slot-->';
const ARTICLE_TEXT_PATTERN =
   /<ArticleText size="(sm|base|lg)">([\s\S]*?)<\/ArticleText>/g;

const markdownSource = computed(() =>
   props.body
      .replace(PROBLEM_DIRECTIVE_PATTERN, `\n\n${PROBLEM_SLOT}\n\n`)
      .replace(ARTICLE_TEXT_PATTERN, (_match, size: string, inner: string) => {
         const cls =
            ARTICLE_TEXT_SIZE_CLASS[size] ?? ARTICLE_TEXT_SIZE_CLASS.base;
         return `<span class="${cls}">${inner}</span>`;
      }),
);

// 与文章页同一条渲染管线（codeHeader 代码块 + shiki 高亮），保证预览即所得
const { html: bodyHtml, update } = useMarkdown({ codeHeader: true });
update(markdownSource.value);
onMounted(() => {
   update(markdownSource.value);
});
watch(markdownSource, (value) => {
   update(value);
});

type BodySegment =
   | { kind: 'html'; html: string }
   | { kind: 'problem'; problem: LearningProblemRef };

/** 题号不在题库里（被删了或手写错了）：标注不可用，界面显示「已下架」 */
const problemRefOf = (baseId: number): LearningProblemRef => {
   const known = props.bank.find((item) => item.baseId === baseId);
   return (
      known ?? {
         baseId,
         pid: 0,
         title: `未知题目 #${baseId}`,
         difficulty: 'medium',
         totalScore: 0,
         unavailable: true,
      }
   );
};

const segments = computed<BodySegment[]>(() => {
   const parts = bodyHtml.value.split(PROBLEM_SLOT);
   const baseIds = [...props.body.matchAll(PROBLEM_DIRECTIVE_PATTERN)].map(
      (match) => Number(match[1]),
   );
   const result: BodySegment[] = [];
   parts.forEach((part, index) => {
      if (part.trim()) result.push({ kind: 'html', html: part });
      if (index < parts.length - 1) {
         result.push({
            kind: 'problem',
            problem: problemRefOf(baseIds[index] ?? 0),
         });
      }
   });
   return result;
});

const hasAuthor = computed(() => Boolean(props.authorName));
const showPublishDate = computed(() => Boolean(props.publishDate));
</script>

<template>
   <StSpace fill-y direction="vertical" class="mt-6 w-[65rem] max-w-full">
      <StSpace align="center" justify="between" fill-x>
         <button
            type="button"
            class="flex shrink-0 cursor-pointer items-center gap-1 st-font-caption text-accent-300 transition-opacity hover:opacity-75"
            @click="emit('back')">
            <Left size="0.875rem" :strokeWidth="3" />
            <span>返回编辑</span>
         </button>
         <span class="st-font-caption text-accent-400">
            本地预览 · 尚未发布
         </span>
      </StSpace>

      <h1
         class="mt-6 w-full text-center text-[2.5rem] font-bold leading-tight text-white">
         {{ title }}
      </h1>
      <p class="w-full text-center st-font-body-normal text-accent-300">
         {{ summary }}
      </p>

      <div class="mt-4 w-full overflow-hidden rounded-[0.5rem]">
         <LearningArticleCover
            :preset="coverPreset ?? null"
            :url="coverUrl || null"
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
                  <StAvatar :url="authorAvatarUrl ?? undefined" size="3rem" />
                  <div class="flex min-w-0 flex-col gap-0.5">
                     <span class="st-font-body-bold truncate text-white">
                        {{ authorName || '匿名' }}
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
                     <span>{{ authorArticleCount ?? 0 }} 篇</span>
                  </StSpace>

                  <StSpace v-if="topicNames" align="center" gap="6px">
                     <BookOne
                        class="shrink-0 text-accent-200"
                        :strokeWidth="3"
                        :size="20" />
                     <span class="shrink-0 text-accent-200">收录专题：</span>
                     <span class="min-w-0 truncate">{{ topicNames }}</span>
                  </StSpace>

                  <StSpace v-if="showPublishDate" align="center" gap="6px">
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
   </StSpace>
</template>
