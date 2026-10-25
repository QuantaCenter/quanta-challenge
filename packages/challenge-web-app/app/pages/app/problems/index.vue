<script setup lang="tsx">
import type { $Enums } from '@prisma/client';
import Divider from './_components/Divider.vue';
import DifficultyFilter from './_components/DifficultyFilter.vue';
import ProblemSearchInput from './_components/ProblemSearchInput.vue';
import { useViewTransition } from '~/composables/use-view-transition';
import {
   ThreeHexagons,
   Left,
   Right,
   LoadingFour,
   Ghost,
} from '@icon-park/vue-next';
import { useScroll, useResizeObserver, watchDebounced } from '@vueuse/core';
import { PassRate, Score, Difficulty } from './_components/CardInfo';

useSeoMeta({ title: '题目 - Quanta Challenge' });

const { $trpc } = useNuxtApp();

const { data: tags, status: tagsStatus } = useAsyncData(
   'tags',
   async () => await $trpc.public.tag.list.query(),
);

// 当前用户的做题状态，用于显示题目卡片状态图标
const { data: problemStatuses } = useAsyncData(
   'problem-statuses',
   () => $trpc.protected.problem.listProblemStatuses.query(),
   { default: () => ({ completed: [] as number[], attempted: [] as number[] }) }
);
const completedProblemIdSet = computed(
   () => new Set(problemStatuses.value.completed)
);
const attemptedProblemIdSet = computed(
   () => new Set(problemStatuses.value.attempted)
);

const scrollContainer = ref<ComponentPublicInstance | null>(null);
const scrollEl = computed(
   () => (scrollContainer.value?.$el as HTMLElement) ?? null,
);
const { arrivedState } = useScroll(scrollEl, { behavior: 'smooth' });

const isOverflow = ref(false);
const checkOverflow = () => {
   if (!scrollEl.value) return;
   const { scrollWidth, clientWidth } = scrollEl.value;
   isOverflow.value = scrollWidth > clientWidth + 1;
};
useResizeObserver(scrollEl, checkOverflow);
watch(tags, () => nextTick(checkOverflow));

const scrollLeft = () => {
   scrollEl.value?.scrollBy({ left: -200, behavior: 'smooth' });
};
const scrollRight = () => {
   scrollEl.value?.scrollBy({ left: 200, behavior: 'smooth' });
};

const { startViewTransition } = useViewTransition();
const selectedTags = ref<number[]>([]);

// 支持从全局搜索等入口通过 /app/problems?tag={tid} 直接定位标签
const route = useRoute();
const initialTag = Number(route.query.tag);
if (route.query.tag !== undefined && !Number.isNaN(initialTag)) {
   selectedTags.value = [initialTag];
}
watch(
   () => route.query.tag,
   (value) => {
      const tid = Number(value);
      if (value === undefined || Number.isNaN(tid)) return;
      if (selectedTags.value[0] !== tid) {
         selectedTags.value = [tid];
         startViewTransition(refresh);
      }
   }
);

const toggleTag = (id: number) => {
   const idx = selectedTags.value.indexOf(id);
   idx === -1 ? selectedTags.value.push(id) : selectedTags.value.splice(idx, 1);
   startViewTransition(refresh);
};
const selectAll = () => {
   selectedTags.value = [];
   startViewTransition(refresh);
};

const selectedDifficulty = ref<$Enums.Difficulty | ''>('');
const searchKeyword = ref('');

watch(selectedDifficulty, () => {
   startViewTransition(refresh);
});

watchDebounced(
   searchKeyword,
   () => {
      startViewTransition(refresh);
   },
   { debounce: 300 },
);

// 当前筛选条件（不含游标），每次请求时实时读取
const currentFilters = () => ({
   tids: selectedTags.value,
   difficulty: selectedDifficulty.value || undefined,
   keyword: searchKeyword.value || undefined,
});

// 游标分页 + 触底加载，见 ~/composables/use-infinite-list.ts
const {
   items: problems,
   status: problemsStatus,
   loadingMore,
   allLoaded,
   refresh,
   sentinelRef,
} = useInfiniteList({
   key: 'getPublicProblems',
   pageSize: 12,
   fetchPage: (cursor, limit) =>
      $trpc.public.problem.listPublicProblems.query({
         ...currentFilters(),
         cursor,
         limit,
      }),
});
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      align="center"
      gap="0"
      class="hide-scrollbar overflow-auto max-md:overflow-x-hidden">
      <StSpace
         fill-y
         direction="vertical"
         class="mt-6 w-full max-w-[65rem] max-md:px-4">
         <h1
            class="text-[2.5rem] font-bold text-white max-md:text-[1.5rem] max-md:leading-[1.2]">
            题目
         </h1>
         <StSkeleton :loading="tagsStatus === 'pending'">
            <template #loading>
               <StSpace fill-x class="max-md:flex-col">
                  <StSpace gap="0.75rem" fill-x>
                     <StSkeletonItem
                        v-for="i in 3"
                        :key="i"
                        class="h-[3.5rem] w-32 !rounded-full" />
                  </StSpace>
                  <StSkeletonItem
                     class="h-[3.5rem] w-[9rem] shrink-0 !rounded-xl" />
                  <StSkeletonItem
                     class="h-[3.5rem] w-[16rem] shrink-0 !rounded-xl" />
               </StSpace>
            </template>
            <StSpace
               fill-x
               class="h-[3.5rem] max-md:h-auto max-md:flex-col max-md:w-full max-md:min-w-0"
               gap="1rem">
               <div
                  class="relative flex-1 min-w-0 h-[3.5rem] max-md:flex-none max-md:w-full">
                  <div
                     :class="[
                        'absolute left-0 top-0 bottom-0 z-10 flex items-center justify-center bg-gradient-to-r from-background to-transparent pr-4 pl-1 transition-opacity duration-300',
                        arrivedState.left || !isOverflow
                           ? 'opacity-0 pointer-events-none'
                           : 'opacity-100',
                     ]">
                     <button
                        @click="scrollLeft"
                        class="w-8 h-8 rounded-full bg-[#2C2C2C] flex items-center justify-center hover:bg-[#3C3C3C] transition-colors cursor-pointer max-md:hidden">
                        <Left theme="outline" size="16" fill="#fff" />
                     </button>
                  </div>
                  <StScrollable
                     ref="scrollContainer"
                     scroll-x
                     fill
                     class="relative hide-scrollbar">
                     <StSpace gap="0.75rem" class="absolute left-0 top-0">
                        <StTagButton
                           @click="selectAll"
                           :selected="selectedTags.length === 0"
                           :icon="ThreeHexagons"
                           :tag="{ name: '全部' }" />
                        <StTagButton
                           v-for="(tag, idx) in tags"
                           :key="idx"
                           :tag="tag"
                           :selected="selectedTags.includes(tag.tid)"
                           @click="toggleTag(tag.tid)" />
                        <div class="w-[2.5rem] h-[3.5rem] shrink-0"></div>
                     </StSpace>
                  </StScrollable>
                  <div
                     :class="[
                        'absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center bg-gradient-to-l from-background to-transparent pl-4 pr-1 transition-opacity duration-300',
                        arrivedState.right || !isOverflow
                           ? 'opacity-0 pointer-events-none'
                           : 'opacity-100',
                     ]">
                     <button
                        @click="scrollRight"
                        class="w-8 h-8 rounded-full bg-[#2C2C2C] flex items-center justify-center hover:bg-[#3C3C3C] transition-colors cursor-pointer max-md:hidden">
                        <Right theme="outline" size="16" fill="#fff" />
                     </button>
                  </div>
                  <div class="h-[3.5rem] max-md:hidden"></div>
               </div>
               <StSpace
                  gap="1rem"
                  class="contents max-md:flex max-md:w-full max-md:min-w-0">
                  <DifficultyFilter v-model:value="selectedDifficulty" />
                  <ProblemSearchInput v-model:value="searchKeyword" />
               </StSpace>
            </StSpace>
         </StSkeleton>
         <Divider />
         <StSkeleton
            :loading="problemsStatus === 'pending' && problems.length === 0"
            class="w-full h-full">
            <template #loading>
               <div
                  class="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-4 md:gap-[1.25rem]">
                  <StSkeletonItem
                     v-for="i in 12"
                     :key="i"
                     class="w-full h-[20rem]"
                     rounded="lg" />
               </div>
            </template>
            <StEmptyStatus
               v-if="!problems.length"
               content="暂无题目"
               class="!w-full !max-w-[61.75rem] pb-32 mt-[5rem]" />
            <div
               v-else
               class="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-4 md:gap-[1.25rem]">
               <a
                  v-for="(problem, idx) in problems"
                  class="h-fit"
                  target="_blank"
                  :style="{ viewTransitionName: `card-${problem.pid}` }"
                  :key="idx"
                  :href="`/challenge/editor/${problem.pid}`">
                  <StProblemCard class="w-full h-fit"
                     :cover-image-name="problem.imageName"
                     :cover-image-thumbhash="problem.imageHash"
                     :cover-image-thumbhash-url="problem.imageThumbhashUrl">
                     <StProblemCardTitle
                        :title="problem.title ?? '匿名题目'"
                        :completed="problem.pid != null && completedProblemIdSet.has(problem.pid)"
                        :attempted="problem.pid != null && attemptedProblemIdSet.has(problem.pid)" />
                     <StProblemCardTags :tags="problem.tags ?? []" />
                     <StProblemCardDivider />
                     <StProblemCardInfo
                        class="pb-3"
                        :class="{ 'px-2': problem.difficulty !== 'very_hard' }">
                        <StProblemCardInfoItem title="通过率">
                           <PassRate :rate="problem.passRate!" />
                        </StProblemCardInfoItem>
                        <StProblemCardInfoItem title="分数">
                           <Score :score="problem.totalScore!" />
                        </StProblemCardInfoItem>
                        <StProblemCardInfoItem title="难度" center>
                           <Difficulty :difficulty="problem.difficulty!" />
                        </StProblemCardInfoItem>
                     </StProblemCardInfo>
                  </StProblemCard>
               </a>
            </div>
         </StSkeleton>
         <div
            v-if="problems.length > 0"
            class="shrink-0 w-full h-[3.5rem] flex items-center justify-center gap-2 text-sm text-accent-400 ">
            <template v-if="loadingMore">
               <LoadingFour
                  class="animate-spin -translate-x-4 max-md:translate-x-0"
                  theme="outline"
                  size="0.875rem" />
               <span>加载中...</span>
            </template>
            <StSpace
               v-else-if="allLoaded"
               align="center"
               gap="0.4em"
               class="-translate-x-4 max-md:translate-x-0">
                <Ghost theme="outline" size="1rem" />
                没有更多题目了～
            </StSpace>
         </div>
         <!-- 触底加载哨兵 -->
         <div ref="sentinelRef" class="shrink-0 w-full h-[1px]"></div>
         <StSpacer fill flex no-shrink height="1rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
