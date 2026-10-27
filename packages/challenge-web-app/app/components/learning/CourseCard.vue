<script setup lang="ts">
import { NuxtLink } from '#components';
import { CheckOne, DocDetail, Round, TableReport } from '@icon-park/vue-next';
import { courseProgress } from '~/utils/learning-progress';
import {
   articlesOfCourse,
   courseTopics,
   type LearningCourse,
} from '~/composables/use-learning';
import { useLearningVisits } from '~/composables/use-learning-visits';
import { useLearningContentStore } from '~/composables/use-learning-store';

/** 课程卡片：与专题卡片同一外观——「图片 + 信息面板」的内胆，下沿圆角与卡片错开。 */
const props = withDefaults(
   defineProps<{
      course: LearningCourse;
      to?: string;
      /** 待审 / 草稿的课程在创作侧要能一眼看出来 */
      showStatus?: boolean;
   }>(),
   { to: undefined, showStatus: false },
);

const content = useLearningContentStore();
const visits = useLearningVisits();
const state = computed(() =>
   courseProgress(
      props.course,
      visits.slice.value,
      courseTopics(props.course.id, content.slice.value),
      articlesOfCourse(props.course.id, content.slice.value),
   ),
);
const badge = computed(() => {
   // 顺序很重要：先判完成，再判纯阅读，最后才给百分比。
   // 纯阅读课程没有题、百分比恒为 0，用「已读 / 未读」表达才不矛盾。
   if (state.value.completed) return '已完成';
   if (state.value.isReadingOnly) return state.value.read ? '已读' : '未读';
   if (state.value.lastOpenedAt === null) return '未开始';
   return `${state.value.percent}%`;
});
const statusDone = computed(
   () =>
      state.value.completed ||
      (state.value.isReadingOnly && state.value.read),
);

// 学习侧只列已上架课程，所以状态文案只在发布页出现
const statusText = computed(() => {
   if (props.course.status === 'published') return '已上架';
   if (props.course.status === 'pending') return '待审核';
   return '草稿';
});

const countText = computed(() =>
   state.value.problemCount > 0
      ? `${state.value.problemCount} 道题`
      : `${state.value.articleCount} 篇文章`,
);
const countIcon = computed(() =>
   state.value.problemCount > 0 ? TableReport : DocDetail,
);

const wrapper = computed(() => (props.to ? NuxtLink : 'div'));
</script>

<template>
   <div class="relative">
      <component :is="wrapper" :to="to" class="group block h-full w-full">
         <div
            class="h-full rounded-xl border border-transparent bg-accent-600 p-2 transition-all hover:border-secondary/50">
           <!-- 内胆：撑满卡片，上图片、下信息面板，二者等宽且紧贴 -->
            <div class="flex h-full flex-col">
               <LearningArticleCover
                  :preset="course.coverPreset ?? null"
                  height="7.5rem"
                  icon-size="3rem"
                  class="shrink-0 rounded-t-lg" />

               <!-- 下部容器：上面两角直角、下面两角圆角 -->
               <div
                  class="flex flex-1 flex-col gap-3 rounded-b-lg bg-accent-500/40 px-3 py-3">
                  <div class="flex flex-col gap-1.5">
                     <div
                        class="line-clamp-1 min-w-0 flex-1 font-bold text-white">
                        {{ course.name }}
                     </div>
                     <p
                        class="st-font-caption text-accent-400 leading-normal line-clamp-2 text-justify transition-colors group-hover:text-accent-300">
                        {{ course.description }}
                     </p>
                  </div>

                  <div
                     class="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2 st-font-caption">
                     <!-- 数量 -->
                     <div class="flex shrink-0 items-center gap-1">
                        <component
                           :is="countIcon"
                           class="shrink-0 text-accent-300"
                           size="1rem" />
                        <span class="text-accent-100">{{ countText }}</span>
                     </div>

                     <!-- 状态 -->
                     <div class="flex shrink-0 items-center gap-1">
                        <CheckOne
                           v-if="statusDone"
                           class="shrink-0 text-success"
                           size="1rem"
                           :strokeWidth="3" />
                        <Round
                           v-else
                           class="shrink-0 text-accent-400"
                           size="1rem"
                           :strokeWidth="3" />
                        <span
                           :class="
                              statusDone ? 'text-success' : 'text-accent-100'
                           ">
                           {{ badge }}
                        </span>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </component>
      <StTag
         v-if="showStatus"
         size="small"
         class="absolute top-2 left-2 z-10"
         :color="course.status === 'published' ? '#a6fb1d' : '#ffbe31'"
         :content="statusText" />
   </div>
</template>
