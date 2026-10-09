<script setup lang="ts">
import { BookOne, Right } from '@icon-park/vue-next';
import {
   topicProgress,
   useLearningCourse,
   useLearningTopics,
} from '~/composables/use-learning';

useSeoMeta({
   title: '专题 - Quanta Challenge',
   description: '按专题系统学习前端知识。',
});

const topics = useLearningTopics();

const rows = computed(() =>
   topics.map((topic, idx) => ({
      topic,
      order: idx + 1,
      stats: topicProgress(topic),
      courseName: useLearningCourse(topic.courseId)?.name ?? '',
      prerequisites: topic.prerequisites.map(
         (id) => topics.find((t) => t.id === id)?.name ?? String(id),
      ),
   })),
);
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      align="center"
      gap="0"
      class="hide-scrollbar overflow-auto">
      <StSpace fill-y direction="vertical" class="mt-6 w-[65rem]">
         <h1 class="text-[2.5rem] font-bold text-white">专题</h1>

         <StSpace direction="vertical" gap="1rem" fill-x class="mt-8">
            <NuxtLink
               v-for="row in rows"
               :key="row.topic.id"
               :to="`/app/topics/${row.topic.id}`"
               class="w-full">
               <div
                  class="group grid w-full grid-cols-[3rem_minmax(0,1fr)_12rem_20rem_1.25rem] items-center gap-6 p-6 rounded-[1.25rem] bg-accent-600 hover:bg-accent-500/80 transition-colors">
                  <div
                     class="size-12 rounded-[0.75rem] bg-accent-500/70 flex items-center justify-center st-font-third-bold text-accent-200">
                     {{ row.order }}
                  </div>

                  <StSpace direction="vertical" gap="0.5rem" class="min-w-0">
                     <StSpace align="center" gap="0.75rem">
                        <BookOne
                           class="text-secondary shrink-0"
                           size="1.25rem"
                           :strokeWidth="3" />
                        <h2 class="text-[1.5rem] font-bold text-white truncate">
                           {{ row.topic.name }}
                        </h2>
                        <StTag
                           v-if="row.courseName"
                           size="small"
                           color="#434343"
                           :content="row.courseName" />
                     </StSpace>
                     <p class="st-font-body-normal text-accent-300 line-clamp-1">
                        {{ row.topic.description }}
                     </p>
                  </StSpace>

                  <div class="min-w-0">
                     <StTag
                        v-if="row.prerequisites.length"
                        size="small"
                        :color="'#434343'"
                        :content="`建议先学 ${row.prerequisites.join(' · ')}`" />
                     <StTag
                        v-else
                        size="small"
                        :color="'#a6fb1d'"
                        content="无前置" />
                  </div>

                  <div class="grid grid-cols-3 gap-6">
                     <StSpace direction="vertical" gap="0.25rem">
                        <span class="st-font-tooltip text-accent-300">
                           文章
                        </span>
                        <span
                           class="st-font-body-bold text-accent-100 font-family-manrope">
                           {{ row.stats.finishedArticles }} /
                           {{ row.stats.articleCount }}
                        </span>
                     </StSpace>
                     <StSpace direction="vertical" gap="0.25rem">
                        <span class="st-font-tooltip text-accent-300">
                           题目
                        </span>
                        <span
                           class="st-font-body-bold text-accent-100 font-family-manrope">
                           {{ row.stats.doneProblems }} /
                           {{ row.stats.problemCount }}
                        </span>
                     </StSpace>
                     <StSpace direction="vertical" gap="0.25rem">
                        <span class="st-font-tooltip text-accent-300">
                           进度
                        </span>
                        <span
                           class="st-font-body-bold text-secondary font-family-manrope">
                           {{ row.stats.percent }}%
                        </span>
                     </StSpace>
                  </div>

                  <Right
                     class="shrink-0 text-accent-400 group-hover:text-secondary group-hover:translate-x-1 transition-all" />
               </div>
            </NuxtLink>
         </StSpace>

         <StSpacer fill flex no-shrink height="4rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
