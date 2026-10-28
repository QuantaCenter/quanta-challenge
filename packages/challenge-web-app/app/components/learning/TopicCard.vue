<script setup lang="ts">
import { CheckOne, DocDetail, Round } from '@icon-park/vue-next';
import ArticleCover from './ArticleCover.vue';

const props = withDefaults(defineProps<{
   id: string;
   title: string;
   description: string;
   articleCount: number;
   problemCount: number;
   percent: number;
   completedCount: number;
   totalCount: number;
   selected?: boolean;
}>(), { selected: false });

const completed = computed(
   () => props.totalCount > 0 && props.completedCount === props.totalCount,
);
const statusText = computed(() =>
   completed.value ? '已完成' : props.percent > 0 ? `${props.percent}%` : '未学习',
);
</script>

<template>
   <NuxtLink
      :to="`/app/learning/${id}`"
      class="group block h-full w-full">
      <div
         class="h-full rounded-xl border bg-accent-600 p-2 transition-all"
         :class="selected ? 'border-secondary' : 'border-transparent hover:border-secondary/50'">
         <div class="flex h-full flex-col">
            <ArticleCover height="7.5rem" icon-size="3rem" class="shrink-0 rounded-t-lg" />
            <div class="flex flex-1 flex-col gap-3 rounded-b-lg bg-accent-500/40 px-3 py-3">
               <div class="flex flex-col gap-1.5">
                  <div class="line-clamp-1 min-w-0 font-bold text-white">{{ title }}</div>
                  <p class="line-clamp-2 text-justify st-font-caption leading-normal text-accent-400 transition-colors group-hover:text-accent-300">
                     {{ description || '开始这个专题的学习旅程。' }}
                  </p>
               </div>
               <div
                  class="mt-auto flex min-w-0 items-center gap-3 whitespace-nowrap st-font-caption">
                  <div class="flex min-w-0 items-center gap-1">
                     <DocDetail class="text-accent-300" size="1rem" />
                     <span class="truncate text-accent-100">
                        {{ articleCount }} 篇文章
                        <template v-if="problemCount">
                           · {{ problemCount }} 道题
                        </template>
                     </span>
                  </div>
                  <div class="ml-auto flex shrink-0 items-center gap-1">
                     <CheckOne
                        v-if="completed"
                        class="text-success"
                        size="1rem"
                        :strokeWidth="3" />
                     <Round v-else class="text-accent-400" size="1rem" :strokeWidth="3" />
                     <span :class="completed ? 'text-success' : 'text-accent-100'">
                        {{ statusText }}
                     </span>
                  </div>
               </div>
            </div>
         </div>
      </div>
   </NuxtLink>
</template>
