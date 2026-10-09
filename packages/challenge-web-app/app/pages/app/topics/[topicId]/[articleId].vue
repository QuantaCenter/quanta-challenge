<script setup lang="ts">
import { CheckOne, DocDetail, Left, Right, TableReport } from '@icon-park/vue-next';
import {
   articleProgress,
   isProblemCompleted,
   topicsOfArticle,
   useLearningTopicArticle,
   type ContentBlock,
   type Difficulty,
} from '~/composables/use-learning';

const route = useRoute();
const topicId = computed(() => route.params.topicId as string);
const articleId = computed(() => route.params.articleId as string);

const found = computed(() =>
   useLearningTopicArticle(topicId.value, articleId.value),
);

const state = computed(() =>
   found.value ? articleProgress(found.value.article) : undefined,
);

const otherTopics = computed(() =>
   found.value
      ? topicsOfArticle(found.value.article.id)
           .filter((t) => t.id !== found.value?.topic.id)
           .map((t) => ({ id: t.id, name: t.name }))
      : [],
);

useSeoMeta({
   title: computed(() =>
      found.value
         ? `${found.value.article.title} - ${found.value.topic.name} - Quanta Challenge`
         : '文章',
   ),
});

const textOf = (block: ContentBlock) => ('text' in block ? block.text : '');
const itemsOf = (block: ContentBlock) => ('items' in block ? block.items : []);

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
   easy: '简单',
   medium: '中等',
   hard: '困难',
   very_hard: '极难',
};

const DIFFICULTY_COLOR: Record<Difficulty, string> = {
   easy: '#14e87e',
   medium: '#ffbe31',
   hard: '#fa2f32',
   very_hard: '#fa2f32',
};
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      align="center"
      gap="0"
      class="hide-scrollbar overflow-auto">
      <StEmptyStatus
         v-if="!found"
         content="这个专题里没有这篇文章"
         class="pt-[10rem]" />

      <StSpace v-else fill-y direction="vertical" class="mt-6 w-[65rem]">
         <StSpace align="center" gap="0.5rem" class="text-accent-300">
            <NuxtLink
               to="/app/topics"
               class="st-font-caption hover:text-secondary transition-colors">
               全部专题
            </NuxtLink>
            <Right size="0.75rem" class="text-accent-400" />
            <NuxtLink
               :to="`/app/topics/${found.topic.id}`"
               class="st-font-caption hover:text-secondary transition-colors">
               {{ found.topic.name }}
            </NuxtLink>
            <Right size="0.75rem" class="text-accent-400" />
            <span class="st-font-caption text-accent-100">
               {{ found.article.title }}
            </span>
         </StSpace>

         <StSpace
            align="start"
            justify="between"
            fill-x
            gap="2rem"
            class="mt-5">
            <StSpace direction="vertical" gap="0.5rem" class="min-w-0">
               <StSpace align="center" gap="0.75rem">
                  <DocDetail
                     class="text-secondary shrink-0"
                     size="1.75rem"
                     :strokeWidth="3" />
                  <h1 class="text-[2rem] font-bold text-white">
                     {{ found.article.title }}
                  </h1>
               </StSpace>
               <p class="st-font-body-normal text-accent-300">
                  {{ found.article.summary }}
               </p>
               <StSpace align="center" gap="0.5rem" class="flex-wrap">
                  <span class="st-font-tooltip text-accent-400">
                     这篇文章还被
                  </span>
                  <NuxtLink
                     v-for="other in otherTopics"
                     :key="other.id"
                     :to="`/app/topics/${other.id}/${found.article.id}`"
                     class="st-font-tooltip text-secondary hover:opacity-75 transition-opacity">
                     {{ other.name }}
                  </NuxtLink>
                  <span
                     v-if="otherTopics.length"
                     class="st-font-tooltip text-accent-400">
                     引用，它不属于任何一个专题
                  </span>
                  <span v-else class="st-font-tooltip text-accent-400">
                     这篇文章不属于本专题，也不被其他专题引用
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

         <article class="article-body mt-8 min-w-0">
            <template v-for="(block, idx) in found.article.content" :key="idx">
               <h2
                  v-if="block.type === 'heading'"
                  class="text-[1.375rem] font-bold text-white mt-10 mb-4 first:mt-0">
                  {{ textOf(block) }}
               </h2>

               <p
                  v-else-if="block.type === 'paragraph'"
                  class="st-font-body-normal text-accent-200 leading-[1.9] my-5">
                  {{ textOf(block) }}
               </p>

               <ul
                  v-else-if="block.type === 'list'"
                  class="my-5 pl-5 list-disc text-accent-200 st-font-body-normal leading-[1.9] space-y-2">
                  <li v-for="(item, i) in itemsOf(block)" :key="i">
                     {{ item }}
                  </li>
               </ul>

               <pre
                  v-else-if="block.type === 'code'"
                  class="my-6 p-5 rounded-[0.75rem] border border-accent-500 bg-simple-editor-background overflow-x-auto"><code
                  class="st-font-caption text-accent-100 font-family-mono">{{ textOf(block) }}</code></pre>

               <div
                  v-else-if="block.type === 'callout'"
                  class="my-6 p-4 rounded-[0.75rem] bg-warning/10 border-l-2 border-warning st-font-caption text-accent-200 leading-[1.8]">
                  {{ textOf(block) }}
               </div>
            </template>

            <StSpace justify="end" align="center" fill-x class="mt-10">
               <NuxtLink :to="`/app/topics/${found.topic.id}`">
                  <StButton size="sm" bordered>
                     <StSpace align="center" gap="0.375rem">
                        <Left size="0.875rem" />
                        <span>返回专题</span>
                     </StSpace>
                  </StButton>
               </NuxtLink>
            </StSpace>
         </article>

         <section
            v-if="found.article.problems.length"
            class="mt-10 p-6 rounded-[1.25rem] bg-accent-600">
            <StSpace direction="vertical" gap="1.25rem" fill-x>
               <StSpace align="center" gap="0.75rem" fill-x>
                  <TableReport
                     class="text-secondary"
                     size="1.25rem"
                     :strokeWidth="3" />
                  <h2 class="st-font-third-bold text-white">本篇题目</h2>
                  <span
                     class="st-font-tooltip text-accent-300 font-family-manrope">
                     {{ found.article.problems.length }} 道
                  </span>
                  <span
                     class="ml-auto st-font-body-bold text-accent-100 font-family-manrope">
                     {{ state?.done ?? 0 }} / {{ state?.total ?? 0 }}
                  </span>
               </StSpace>

               <div class="grid grid-cols-2 gap-3">
                  <div
                     v-for="problem in found.article.problems"
                     :key="problem.baseId"
                     class="p-4 rounded-[0.75rem] bg-accent-500/40 flex items-center gap-3">
                     <CheckOne
                        v-if="
                           problem.unavailable ||
                           isProblemCompleted(problem.baseId)
                        "
                        class="shrink-0 text-success"
                        size="1.125rem"
                        :strokeWidth="3" />
                     <div
                        v-else
                        class="shrink-0 size-[1.125rem] rounded-full border-2 border-accent-400" />

                     <StSpace direction="vertical" gap="0.25rem" class="min-w-0 flex-1">
                        <span
                           class="st-font-caption truncate"
                           :class="
                              problem.unavailable
                                 ? 'text-accent-400'
                                 : 'text-accent-100'
                           ">
                           {{ problem.title }}
                        </span>
                        <StSpace align="center" gap="0.5rem">
                           <StTag
                              v-if="problem.unavailable"
                              size="small"
                              color="#434343"
                              content="该题目不可用" />
                           <template v-else>
                              <StTag
                                 size="small"
                                 :color="DIFFICULTY_COLOR[problem.difficulty]"
                                 :content="DIFFICULTY_LABEL[problem.difficulty]" />
                              <span
                                 class="st-font-tooltip text-accent-400 font-family-manrope">
                                 {{ problem.totalScore }} 分
                              </span>
                           </template>
                        </StSpace>
                     </StSpace>

                     <StButton v-if="!problem.unavailable" size="sm" bordered>
                        <span>去做题</span>
                     </StButton>
                  </div>
               </div>
            </StSpace>
         </section>

         <StSpacer fill flex no-shrink height="4rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
