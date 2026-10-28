<script setup lang="ts">
import { Left } from '@icon-park/vue-next';
import ArticleRow from '~/components/learning/ArticleRow.vue';
import ProblemBlock from '~/components/learning/ProblemBlock.vue';

const route = useRoute();
const id = computed(() => String(route.params.id));
const { $trpc } = useNuxtApp();

const { data, status, error, refresh } = useAsyncData(
   () => `learning-topic-${id.value}`,
   () => $trpc.protected.learning.getTopic.query({ id: id.value }),
);
const topic = computed(() => data.value);
const articleCount = computed(
   () => topic.value?.items.filter((item) => item.type === 'article').length ?? 0,
);
const problemCount = computed(
   () => topic.value?.items.filter((item) => item.type === 'problem').length ?? 0,
);

useSeoMeta({
   title: () => `${topic.value?.title || '学习专题'} - Quanta Challenge`,
});

onMounted(() => {
   void $trpc.protected.learning.recordVisit
      .mutate({ id: id.value })
      .catch(() => undefined);
});
</script>

<template>
   <StSpace fill direction="vertical" align="center" gap="0" class="hide-scrollbar overflow-auto">
      <StSpace fill-y direction="vertical" gap="0" class="mt-6 w-[65rem] max-w-full pb-16 max-lg:px-4">
      <div class="flex w-full items-center gap-2 text-accent-300">
         <NuxtLink to="/app/learning" class="flex items-center gap-1 st-font-caption transition-colors hover:text-secondary">
            <Left size="0.875rem" />全部专题
         </NuxtLink>
         <span class="st-font-caption text-accent-400">/</span>
         <span class="st-font-caption text-accent-100">{{ topic?.title || '专题' }}</span>
      </div>

      <div v-if="status === 'pending'" class="w-full space-y-5">
         <StSkeletonItem class="h-40 w-full !rounded-2xl" />
         <StSkeletonItem v-for="index in 4" :key="index" class="h-28 w-full !rounded-2xl" />
      </div>
      <div v-else-if="error || !topic" class="w-full py-24 text-center">
         <p class="text-error">专题加载失败或不存在</p>
         <button class="mt-3 text-sm text-white underline" @click="refresh()">重新加载</button>
      </div>
      <template v-else>
         <div class="mt-5 flex w-full items-end gap-4">
            <div class="min-w-0 flex-1">
               <h1 class="text-[2.5rem] font-bold text-white max-md:text-[2rem]">{{ topic.title }}</h1>
               <p class="mt-2 st-font-body-normal text-accent-300">{{ topic.description }}</p>
            </div>
            <span class="mb-2 shrink-0 st-font-tooltip text-accent-400">
               {{ articleCount }} 篇文章 · {{ problemCount }} 道题
            </span>
         </div>

         <div v-if="topic.items.length" class="mt-8 w-full">
            <template v-for="item in topic.items" :key="`${item.type}-${item.sort}`">
               <ArticleRow
                  v-if="item.type === 'article'"
                  :id="item.articleId"
                  :title="item.title"
                  :summary="item.summary"
                  :cover-image-name="item.coverImageName"
                  :published-at="item.publishedAt"
                  :author-name="item.authorName"
                  :author-avatar-name="item.authorAvatarName"
                  :problem-count="item.problemCount"
                  :completed="item.completed"
                  :percent="item.percent" />
               <ProblemBlock
                  v-else
                  :problem-id="item.problemId"
                  :title="item.title"
                  :difficulty="item.difficulty"
                  :total-score="item.totalScore"
                  :tags="item.tags"
                  :cover-image-name="item.coverImageName"
                  :cover-image-thumbhash="item.coverImageThumbhash"
                  :completed="item.completed"
                  row />
            </template>
         </div>
         <StEmptyStatus v-else content="该专题暂时没有内容" class="!w-full py-20" />
      </template>
      </StSpace>
   </StSpace>
</template>
