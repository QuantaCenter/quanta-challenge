<script setup lang="ts">
import { CheckOne, DocDetail, Round, TableReport } from '@icon-park/vue-next';
import { topicProgress } from '~/utils/learning-progress';
import {
   articlesOfTopic,
   useLearningCourse,
   type LearningTopic,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import { useLearningVisits } from '~/composables/use-learning-visits';

/** 专题卡片：与课程卡片同一外观 */
const props = withDefaults(
   defineProps<{
      topic: LearningTopic;
      to: string;
      /** 专题栏里标出「当前所在的这一个」 */
      selected?: boolean;
   }>(),
   { selected: false },
);

const content = useLearningContentStore();
const visits = useLearningVisits();

const articleCount = computed(
   () => articlesOfTopic(props.topic, content).length,
);
const state = computed(() =>
   topicProgress(
      props.topic,
      visits.slice.value,
      articlesOfTopic(props.topic, content),
   ),
);
const courseName = computed(
   () => useLearningCourse(props.topic.courseId, content)?.name ?? '',
);

const countText = computed(() =>
   state.value.problemCount > 0
      ? `${state.value.problemCount} 道题`
      : `${articleCount.value} 篇文章`,
);
const countIcon = computed(() =>
   state.value.problemCount > 0 ? TableReport : DocDetail,
);
const statusDone = computed(
   () =>
      state.value.completed ||
      (state.value.isReadingOnly && state.value.read),
);
const statusText = computed(() => {
   if (state.value.completed) return '已完成';
   if (state.value.isReadingOnly) return state.value.read ? '已读' : '未学习';
   return state.value.percent > 0 ? `${state.value.percent}%` : '未学习';
});
</script>

<template>
   <NuxtLink :to="to" class="group block h-full w-full">
      <div
         class="h-full rounded-xl border bg-accent-600 p-2 transition-all"
         :class="
            selected
               ? 'border-secondary'
               : 'border-transparent hover:border-secondary/50'
         ">
         <!-- 内胆：上图片、下信息面板 -->
         <div class="flex h-full flex-col">
            <LearningArticleCover
               :preset="topic.coverPreset ?? null"
               height="7.5rem"
               icon-size="3rem"
               class="shrink-0 rounded-t-lg" />

            <!-- 下部容器 -->
            <div
               class="flex flex-1 flex-col gap-3 rounded-b-lg bg-accent-500/40 px-3 py-3">
               <div class="flex flex-col gap-1.5">
                  <div class="flex items-center gap-2">
                     <div class="line-clamp-1 min-w-0 flex-1 font-bold text-white">
                        {{ topic.name }}
                     </div>
                     <StTag
                        size="small"
                        color="#434343"
                        :content="courseName"
                        class="shrink-0" />
                  </div>

                  <p
                     class="st-font-caption text-accent-400 leading-normal line-clamp-2 text-justify transition-colors group-hover:text-accent-300">
                     {{ topic.description }}
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
                        :class="statusDone ? 'text-success' : 'text-accent-100'">
                        {{ statusText }}
                     </span>
                  </div>
               </div>
            </div>
         </div>
      </div>
   </NuxtLink>
</template>
