<script setup lang="ts">
import {
   BookOne,
   CheckOne,
   DocDetail,
   Left,
   Plus,
} from '@icon-park/vue-next';
import {
   articleProgress,
   articlesOfTopic,
   courseProgress,
   courseTopics,
   topicsOfArticle,
   useLearningCourse,
   useLearningCourses,
   useLearningTopic,
} from '~/composables/use-learning';
import { useMessage } from '~/components/st/Message/use-message';

const route = useRoute();
const topicId = computed(() => route.params.topicId as string);
const message = useMessage();

const topic = computed(() => useLearningTopic(topicId.value));
const courses = useLearningCourses();

const course = computed(() =>
   topic.value ? useLearningCourse(topic.value.courseId) : undefined,
);

const siblingTopics = computed(() =>
   topic.value ? courseTopics(topic.value.courseId) : [],
);

useSeoMeta({
   title: computed(() =>
      topic.value ? `${topic.value.name} - 专题 - Quanta Challenge` : '专题',
   ),
});

const rows = computed(() =>
   (topic.value ? articlesOfTopic(topic.value) : []).map((article, idx) => ({
      article,
      order: idx + 1,
      state: articleProgress(article),
      otherTopics: topicsOfArticle(article.id)
         .filter((t) => t.id !== topic.value?.id)
         .map((t) => t.name),
   })),
);

const courseRows = computed(() =>
   courses.map((item) => ({ item, stats: courseProgress(item) })),
);

const isDone = (state: {
   completed: boolean;
   isReadingOnly: boolean;
   read: boolean;
}) => state.completed || (state.isReadingOnly && state.read);

const publishArticle = () =>
   message.info('静态预览', '文章编辑页还没做，这一页只走查布局');
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      align="center"
      gap="0"
      class="hide-scrollbar overflow-auto">
      <StEmptyStatus
         v-if="!topic"
         content="没有这个专题"
         class="pt-[10rem]" />

      <StSpace v-else fill-y direction="vertical" class="mt-6 w-[65rem]">
         <StSpace align="center" gap="0.5rem" class="text-accent-300">
            <NuxtLink
               to="/app/topics"
               class="st-font-caption hover:text-secondary transition-colors flex items-center gap-1">
               <Left size="0.875rem" />
               全部专题
            </NuxtLink>
            <span class="st-font-caption text-accent-400">/</span>
            <span class="st-font-caption text-accent-100">
               {{ topic.name }}
            </span>
         </StSpace>

         <StSpace align="start" gap="1.5rem" fill-x class="mt-5">
            <div class="flex-1 min-w-0">
               <StSpace align="center" gap="0.5rem" fill-x>
                  <h2 class="st-font-third-bold text-white">专题</h2>
                  <span class="st-font-tooltip text-accent-400">
                     {{ course?.name }}
                  </span>
               </StSpace>

               <div class="grid grid-cols-3 gap-3 mt-4">
                  <NuxtLink
                     v-for="item in siblingTopics"
                     :key="item.id"
                     :to="`/app/topics/${item.id}`"
                     class="p-4 rounded-[1rem] border transition-colors"
                     :class="
                        item.id === topic.id
                           ? 'border-secondary bg-accent-600'
                           : 'border-accent-500 bg-accent-600/60 hover:border-accent-300'
                     ">
                     <StSpace direction="vertical" gap="0.375rem" fill-x>
                        <span
                           class="st-font-body-bold text-accent-100 truncate">
                           {{ item.name }}
                        </span>
                        <span
                           class="st-font-tooltip text-accent-300 line-clamp-2">
                           {{ item.description }}
                        </span>
                     </StSpace>
                  </NuxtLink>
               </div>

               <StSpace align="center" gap="0.75rem" fill-x class="mt-8">
                  <h2 class="st-font-third-bold text-white">文章</h2>
                  <span class="st-font-tooltip text-accent-400">
                     {{ rows.length }} 篇
                  </span>
                  <StButton
                     size="sm"
                     bordered
                     class="ml-auto"
                     @click="publishArticle">
                     <StSpace align="center" gap="0.375rem">
                        <Plus size="1rem" />
                        <span>发布文章</span>
                     </StSpace>
                  </StButton>
               </StSpace>

               <StSpace direction="vertical" gap="0.75rem" fill-x class="mt-4">
                  <div
                     v-for="row in rows"
                     :key="row.article.id"
                     class="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-3">
                     <div class="flex justify-center">
                        <div
                           v-if="isDone(row.state)"
                           class="size-[1.25rem] rounded-full border-2 border-success text-success flex items-center justify-center">
                           <CheckOne size="0.75rem" :strokeWidth="4" />
                        </div>
                        <div
                           v-else
                           class="size-[1.25rem] rounded-full border-2 border-accent-400" />
                     </div>

                     <NuxtLink
                        :to="`/app/topics/${topic.id}/${row.article.id}`"
                        class="w-full">
                        <div
                           class="group w-full p-4 rounded-[1rem] bg-accent-600 hover:bg-accent-500/80 transition-colors flex items-center gap-5">
                           <div
                              class="shrink-0 size-9 rounded-[0.5rem] bg-accent-500/70 flex items-center justify-center st-font-body-bold text-accent-200">
                              {{ row.order }}
                           </div>

                           <StSpace
                              direction="vertical"
                              gap="0.375rem"
                              class="min-w-0 flex-1">
                              <StSpace align="center" gap="0.5rem">
                                 <DocDetail
                                    class="text-accent-200 shrink-0"
                                    size="1rem"
                                    :strokeWidth="3" />
                                 <span
                                    class="st-font-body-bold text-accent-100 truncate">
                                    {{ row.article.title }}
                                 </span>
                                 <StTag
                                    v-if="row.state.isReadingOnly"
                                    size="small"
                                    color="#434343"
                                    content="纯阅读" />
                                 <StTag
                                    v-if="row.otherTopics.length"
                                    size="small"
                                    color="#2b3a1a"
                                    :content="`也见于 ${row.otherTopics.join(' · ')}`" />
                              </StSpace>
                              <span
                                 class="st-font-caption text-accent-300 truncate">
                                 {{ row.article.summary }}
                              </span>
                           </StSpace>

                           <span
                              class="shrink-0 st-font-tooltip text-accent-300 w-[4.5rem] text-right">
                              {{
                                 row.state.isReadingOnly
                                    ? '无题目'
                                    : `${row.state.done} / ${row.state.total} 题`
                              }}
                           </span>

                           <div class="shrink-0 w-[14rem] flex items-center">
                              <LearningProgressBar
                                 :progress="row.state.progress"
                                 :percent="row.state.percent"
                                 :completed="row.state.completed"
                                 :is-reading-only="row.state.isReadingOnly"
                                 :read="row.state.read" />
                           </div>
                        </div>
                     </NuxtLink>
                  </div>

                  <StEmptyStatus
                     v-if="rows.length === 0"
                     content="这个专题还没有引用文章"
                     class="py-10" />
               </StSpace>
            </div>

            <div class="shrink-0 w-[16rem] flex flex-col gap-4">
               <div class="p-5 rounded-[1.25rem] bg-accent-600">
                  <StSpace direction="vertical" gap="0.75rem" fill-x>
                     <span class="st-font-body-bold text-accent-100">
                        我学习的课程
                     </span>

                     <div
                        v-for="row in courseRows"
                        :key="row.item.id"
                        class="p-3 rounded-[0.75rem] bg-accent-500/60 flex flex-col gap-[0.375rem]">
                        <StSpace align="center" gap="0.5rem" fill-x>
                           <BookOne
                              class="shrink-0 text-secondary"
                              size="1rem"
                              :strokeWidth="3" />
                           <span
                              class="st-font-caption text-accent-100 truncate">
                              {{ row.item.name }}
                           </span>
                           <span
                              class="ml-auto shrink-0 st-font-tooltip font-family-manrope"
                              :class="
                                 row.stats.completed
                                    ? 'text-success'
                                    : 'text-accent-300'
                              ">
                              {{ row.stats.percent }}%
                           </span>
                        </StSpace>
                        <span class="st-font-tooltip text-accent-400">
                           {{ row.stats.finishedTopics }} /
                           {{ row.stats.topicCount }} 个专题
                        </span>
                     </div>
                  </StSpace>
               </div>

               <div
                  class="h-[10rem] rounded-[1.25rem] border border-dashed border-accent-400 flex items-center justify-center st-font-body-bold text-accent-400">
                  AD
               </div>
            </div>
         </StSpace>

         <StSpacer fill flex no-shrink height="4rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
