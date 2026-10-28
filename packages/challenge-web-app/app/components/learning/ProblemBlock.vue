<script setup lang="ts">
import {
   CheckOne,
   DocDetail,
   ErrorPicture,
   Right,
   Round,
} from '@icon-park/vue-next';

const props = defineProps<{
   problemId: number | null;
   title: string | null;
   difficulty: string | null;
   totalScore: number | null;
   completed: boolean;
   tags?: { name: string; color: string | null }[];
   coverImageName?: string | null;
   coverImageThumbhash?: string | null;
   row?: boolean;
}>();

const difficultyText: Record<string, string> = {
   easy: '简单',
   medium: '中等',
   hard: '困难',
   very_hard: '非常困难',
};

const href = computed(() =>
   props.problemId == null ? undefined : `/challenge/editor/${props.problemId}`,
);

const difficultyColor: Record<string, string> = {
   easy: '#14e87e',
   medium: '#ffbe31',
   hard: '#fa7c0e',
   very_hard: '#fa2f32',
};
const imageSrc = computed(() =>
   props.coverImageName
      ? `/api/static/${encodeURIComponent(props.coverImageName)}`
      : '',
);
const linkComponent = resolveComponent('NuxtLink');
</script>

<template>
   <div :class="{ 'opacity-60': !href }">
      <component
         :is="href ? linkComponent : 'div'"
         :to="href"
         class="group flex w-full items-stretch gap-4 transition max-sm:gap-3"
         :class="
            row
               ? 'py-4'
               : 'rounded-xl bg-accent-600 p-2 hover:bg-accent-500/80'
         ">
         <div
            class="relative h-[8.75rem] w-[14rem] shrink-0 overflow-hidden rounded-[0.375rem] bg-accent-500/40 ring-1 ring-white/5 max-sm:h-[6.5rem] max-sm:w-[8.5rem]">
            <StImage
               :src="imageSrc"
               :thumbhash="coverImageThumbhash ?? undefined"
               width="100%"
               height="100%"
               object="cover"
               alt="题目封面">
               <template #fallback="{ style }">
                  <div
                     class="flex size-full items-center justify-center bg-accent-600/75 text-accent-500"
                     :style="style">
                     <ErrorPicture size="2rem" />
                  </div>
               </template>
            </StImage>
            <div
               class="absolute inset-0 bg-background/5 transition-colors group-hover:bg-background/20" />
         </div>

         <div
            class="flex min-w-0 flex-1 flex-col justify-between gap-2"
            :class="{ 'py-2 pr-2': !row }">
            <div class="flex flex-col gap-2">
               <div class="flex items-start gap-3">
                  <h3
                     class="line-clamp-1 min-w-0 flex-1 text-[1.25rem] font-bold leading-snug text-white transition-colors group-hover:text-secondary max-sm:text-base">
                     {{ title || '题目暂不可用' }}
                  </h3>
                  <Right
                     v-if="href"
                     class="shrink-0 text-accent-400 transition-colors group-hover:text-secondary"
                     size="1rem" />
               </div>

               <div class="flex flex-wrap items-center gap-2">
                  <StTag
                     v-if="difficulty"
                     size="small"
                     :color="difficultyColor[difficulty] || '#575757'"
                     :content="difficultyText[difficulty] || '未知难度'" />
                  <StTag
                     v-for="tag in tags ?? []"
                     :key="tag.name"
                     size="small"
                     :color="tag.color || '#434343'"
                     :content="tag.name" />
               </div>
            </div>

            <div class="flex items-center gap-3 st-font-caption text-accent-400">
               <span
                  v-if="totalScore != null"
                  class="flex shrink-0 items-center gap-1">
                  <DocDetail size="0.875rem" />
                  {{ totalScore }} 分
               </span>
               <span
                  class="flex shrink-0 items-center gap-1"
                  :class="completed ? 'text-success' : 'text-accent-400'">
                  <CheckOne
                     v-if="completed"
                     size="0.875rem"
                     :strokeWidth="3" />
                  <Round v-else size="0.875rem" :strokeWidth="3" />
                  {{ completed ? '已完成' : '未完成' }}
               </span>
            </div>
         </div>
      </component>
      <StDivider v-if="row" simple class="opacity-30" />
   </div>
</template>
