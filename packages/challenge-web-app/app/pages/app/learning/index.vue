<script setup lang="ts">
import DEFAULT_SPACE_URL from '~/assets/images/default-space-banner.webp';
import DEFAULT_AVATAR_URL from '@/assets/images/default-avatar.webp';
import { CheckOne, History, Right } from '@icon-park/vue-next';
import ArticleRow from '~/components/learning/ArticleRow.vue';
import CoverRail from '~/components/learning/CoverRail.vue';
import LearningProgressBar from '~/components/learning/LearningProgressBar.vue';
import TopicCard from '~/components/learning/TopicCard.vue';
import useAuthStore from '~/stores/auth-store';

useSeoMeta({ title: '学习 - Quanta Challenge' });

const { $trpc } = useNuxtApp();
const authStore = useAuthStore();
const { data, status, error, refresh } = useAsyncData(
   'learning-home',
   async () => {
      const [topics, articles, recent, profile] = await Promise.all([
         $trpc.protected.learning.listTopics.query(),
         $trpc.protected.learning.listArticles.query(),
         $trpc.protected.dashboard.getRecentLearning.query(),
         authStore.user?.name
            ? $trpc.protected.user.getUserByName.query({
                 name: authStore.user.name,
              })
            : Promise.resolve(null),
      ]);
      return { topics, articles, recent, profile };
   },
);

const topics = computed(() => data.value?.topics ?? []);
const articles = computed(() => data.value?.articles ?? []);
const recent = computed(() => data.value?.recent ?? []);
const profile = computed(() => data.value?.profile);
const startedCount = computed(
   () => topics.value.filter((topic) => topic.percent > 0).length,
);
const completedCount = computed(
   () => topics.value.filter((topic) => topic.completed).length,
);
</script>

<template>
   <StSpace fill direction="vertical" align="center" gap="0" class="hide-scrollbar overflow-auto">
      <StSpace fill-y direction="vertical" class="mt-6 w-[65rem] max-w-full pb-16 max-lg:px-4">
         <h1 class="text-[2.5rem] font-bold text-white max-md:text-[2rem]">学习</h1>

         <div v-if="status === 'pending'" class="mt-5 w-full space-y-5">
            <StSkeletonItem class="h-64 w-full !rounded-xl" />
            <StSkeletonItem class="h-96 w-full !rounded-xl" />
         </div>
         <StCard v-else-if="error" class="mt-5 !h-auto py-10 text-center">
            <p class="text-error">学习内容加载失败</p>
            <StButton class="mx-auto mt-4" bordered @click="refresh()">重新加载</StButton>
         </StCard>

         <div
            v-else
            class="mt-5 flex w-full items-start gap-6 max-lg:flex-col">
            <main class="min-w-0 flex-1">
               <h2 class="st-font-third-bold text-white">专题</h2>
               <CoverRail v-if="topics.length" class="mt-4">
                  <div
                     v-for="topic in topics"
                     :key="topic.id"
                     class="w-[15rem] shrink-0">
                     <TopicCard
                        :id="topic.id"
                        :title="topic.title"
                        :description="topic.description"
                        :article-count="topic._count.articles"
                        :problem-count="topic._count.problems"
                        :percent="topic.percent"
                        :completed-count="topic.completedCount"
                        :total-count="topic.totalCount" />
                  </div>
               </CoverRail>
               <StEmptyStatus v-else content="暂无已发布的学习专题" class="py-10" />

               <h2 class="mt-8 st-font-third-bold text-white">文章</h2>
               <div v-if="articles.length" class="mt-4">
                  <ArticleRow
                     v-for="article in articles"
                     :key="article.id"
                     v-bind="article" />
               </div>
               <StEmptyStatus v-else content="暂无已发布的文章" class="py-10" />
            </main>

            <aside
               class="w-[19rem] shrink-0 max-lg:w-full">
               <div
                  class="relative w-full overflow-hidden rounded-xl bg-accent-600 p-2 pb-5">
                  <div class="relative h-[10rem]">
                     <StImage
                        :src="profile?.bannerImageUrl || DEFAULT_SPACE_URL"
                        width="100%"
                        height="7.5rem"
                        object="cover"
                        class="rounded-t-lg rounded-b-none" />
                     <div
                        class="absolute bottom-0 left-4 rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 p-1 shadow-lg shadow-black/20">
                        <StImage
                           :src="profile?.avatarUrl || DEFAULT_AVATAR_URL"
                           width="4.75rem"
                           height="4.75rem"
                           object="cover"
                           class="!rounded-md" />
                     </div>
                  </div>

                  <div class="px-4">
                     <h2 class="truncate st-font-third-bold text-white">
                        {{ profile?.displayName || profile?.name || '学习者' }}
                     </h2>
                     <p class="mt-1 line-clamp-2 st-font-caption text-accent-300">
                        {{ profile?.UserInfo?.bio || '保持好奇，持续学习。' }}
                     </p>

                     <div class="my-4 h-px w-full bg-accent-500" />

                     <div class="grid grid-cols-2 gap-3">
                        <div class="rounded-lg bg-accent-500/50 px-3 py-2.5">
                           <div class="font-family-manrope st-font-body-bold text-white">
                              {{ startedCount }}
                           </div>
                           <div class="st-font-tooltip text-accent-300">
                              已开始专题
                           </div>
                        </div>
                        <div class="rounded-lg bg-accent-500/50 px-3 py-2.5">
                           <div class="font-family-manrope st-font-body-bold text-success">
                              {{ completedCount }}
                           </div>
                           <div class="st-font-tooltip text-accent-300">
                              已完成专题
                           </div>
                        </div>
                     </div>

                     <div class="my-4 h-px w-full bg-accent-500" />

                  <StSpace align="center" gap="0.5rem">
                     <History size="1.125rem" class="text-accent-200" />
                     <h2 class="st-font-body-bold text-white">最近学习</h2>
                  </StSpace>

                  <StSpace
                     v-if="recent.length"
                     direction="vertical"
                     gap="0.75rem"
                     fill-x
                     class="mt-3">
                     <NuxtLink
                        v-for="item in recent"
                        :key="item.topicId"
                        :to="`/app/learning/${item.topicId}`"
                        class="group rounded-lg bg-accent-500/50 p-3 transition-colors hover:bg-accent-500">
                        <StSpace align="center" gap="0.5rem" fill-x>
                           <span
                              class="min-w-0 flex-1 truncate st-font-caption text-accent-100">
                              {{ item.title }}
                           </span>
                           <CheckOne
                              v-if="item.completed"
                              class="shrink-0 text-success"
                              size="1rem"
                              :strokeWidth="4" />
                           <Right
                              v-else
                              class="shrink-0 text-accent-400 transition-transform group-hover:translate-x-0.5"
                              size="0.875rem" />
                        </StSpace>
                        <LearningProgressBar
                           :percent="item.percent"
                           class="mt-2" />
                     </NuxtLink>
                  </StSpace>
                  <div
                     v-else
                     class="mt-3 rounded-lg bg-accent-500/40 px-4 py-6 text-center st-font-caption text-accent-400">
                     暂无学习记录
                  </div>
                  </div>
               </div>
            </aside>
         </div>
      </StSpace>
   </StSpace>
</template>
