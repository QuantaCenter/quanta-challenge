<script setup lang="ts">
import dayjs from 'dayjs';
import { BookOne, Calendar, Right } from '@icon-park/vue-next';
import ArticleCover from '~/components/learning/ArticleCover.vue';
import ArticleReader from '~/components/learning/ArticleReader.vue';
import { useMessage } from '~/components/st/Message/use-message';

const route = useRoute();
const articleId = computed(() => String(route.params.articleId));
const { $trpc } = useNuxtApp();
const message = useMessage();
const marking = ref(false);

const { data: article, status, error, refresh } = useAsyncData(
   () => `learning-article-${articleId.value}`,
   () => $trpc.protected.learning.getArticle.query({ id: articleId.value }),
);

useSeoMeta({
   title: () => `${article.value?.title || '学习文章'} - Quanta Challenge`,
});

const markRead = async () => {
   if (marking.value || article.value?.isRead) return;
   marking.value = true;
   try {
      await $trpc.protected.learning.markRead.mutate({ id: articleId.value });
      await refresh();
      message.success('已标记为已读');
   } catch (cause) {
      message.error('保存阅读状态失败', cause instanceof Error ? cause.message : String(cause));
   } finally {
      marking.value = false;
   }
};

const authorAvatarUrl = computed(() =>
   article.value?.authorAvatarName
      ? `/api/static/${encodeURIComponent(article.value.authorAvatarName)}`
      : undefined,
);
const publishDate = computed(() =>
   article.value?.publishedAt
      ? dayjs(article.value.publishedAt).format('YYYY-MM-DD')
      : '',
);
const topicNames = computed(() =>
   article.value?.publishedTopics.map((topic) => topic.title).join(' · ') ?? '',
);
</script>

<template>
   <StSpace fill direction="vertical" align="center" gap="0" class="hide-scrollbar overflow-auto">
      <StSpace fill-y direction="vertical" gap="0" class="mt-6 w-[65rem] max-w-full pb-16 max-lg:px-4">
      <div v-if="status === 'pending'" class="space-y-5">
         <StSkeletonItem class="h-48 w-full !rounded-2xl" />
         <StSkeletonItem class="h-96 w-full !rounded-2xl" />
      </div>
      <div v-else-if="error || !article" class="py-24 text-center">
         <p class="text-error">文章加载失败或不存在</p>
         <button class="mt-3 text-sm text-white underline" @click="refresh()">重新加载</button>
      </div>
      <template v-else>
         <div class="flex w-full items-center gap-2 text-accent-300">
            <NuxtLink to="/app/learning" class="shrink-0 st-font-caption transition-colors hover:text-secondary">
               全部文章
            </NuxtLink>
            <Right size="0.75rem" class="shrink-0 text-accent-400" />
            <span class="min-w-0 truncate st-font-caption text-accent-100">{{ article.title }}</span>
         </div>

         <header class="w-full">
            <h1 class="mt-6 w-full text-center text-[2.5rem] font-bold leading-tight text-white max-md:text-[2rem]">
               {{ article.title }}
            </h1>
            <p v-if="article.summary" class="mt-2 w-full text-center st-font-body-normal text-accent-300">
               {{ article.summary }}
            </p>
            <div
               v-if="article.coverImageName"
               class="mt-4 w-full overflow-hidden rounded-[0.5rem]">
               <ArticleCover
                  :image-name="article.coverImageName"
                  height="20rem"
                  icon-size="6rem" />
            </div>
            <StDivider v-else simple class="mt-6 opacity-30" />
         </header>

         <div class="mt-8 grid w-full grid-cols-[minmax(0,1fr)_13rem] gap-6 max-md:grid-cols-1">
            <article class="min-w-0">
               <ArticleReader
                  :source="article.source"
                  :problems="article.problems"
                  :playgrounds="article.playgrounds"
                  :is-read="article.isRead"
                  :percent="article.percent"
                  :marking="marking"
                  @mark-read="markRead" />
            </article>

            <aside class="sticky top-[5.75rem] min-w-0 self-start max-md:static">
               <div class="flex flex-col gap-4">
                  <div class="flex items-center gap-3">
                     <StAvatar :url="authorAvatarUrl" size="3rem" />
                     <div class="flex min-w-0 flex-col gap-0.5">
                        <span class="truncate st-font-body-bold text-white">{{ article.authorName }}</span>
                        <span class="st-font-caption text-accent-400">作者</span>
                     </div>
                  </div>
                  <div class="h-px w-full bg-accent-500" />
                  <div class="flex w-full flex-col gap-3 st-font-body-normal">
                     <div v-if="article.publishedTopics.length" class="flex items-center gap-1.5">
                        <BookOne class="shrink-0 text-accent-200" :strokeWidth="3" :size="20" />
                        <span class="shrink-0 text-accent-200">收录专题：</span>
                        <span class="min-w-0 truncate">{{ topicNames }}</span>
                     </div>
                     <div v-if="publishDate" class="flex items-center gap-1.5">
                        <Calendar class="shrink-0 text-accent-200" :strokeWidth="3" :size="20" />
                        <span class="shrink-0 text-accent-200">发布时间：</span>
                        <span class="min-w-0 truncate">{{ publishDate }}</span>
                     </div>
                  </div>
               </div>
            </aside>
         </div>
      </template>
      </StSpace>
   </StSpace>
</template>
