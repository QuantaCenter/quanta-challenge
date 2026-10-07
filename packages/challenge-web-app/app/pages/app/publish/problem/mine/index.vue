<script setup lang="tsx">
import StSpace from '~/components/st/Space/index.vue';
import { $Enums } from '@prisma/client';
import { useViewTransition } from '~/composables/use-view-transition';
import Divider from '../_components/Divider.vue';
import { ThreeHexagons, Left, Right } from '@icon-park/vue-next';
import { useScroll, useResizeObserver } from '@vueuse/core';

useSeoMeta({ title: '我的发布 - Quanta Challenge' });

const { $trpc } = useNuxtApp();

const scrollContainer = ref<ComponentPublicInstance | null>(null);
const scrollEl = computed(
   () => (scrollContainer.value?.$el as HTMLElement) ?? null
);
const { arrivedState } = useScroll(scrollEl, { behavior: 'smooth' });

const isOverflow = ref(false);
const checkOverflow = () => {
   if (!scrollEl.value) return;
   const { scrollWidth, clientWidth } = scrollEl.value;
   isOverflow.value = scrollWidth > clientWidth + 1;
};
useResizeObserver(scrollEl, checkOverflow);

const scrollLeft = () => {
   scrollEl.value?.scrollBy({ left: -200, behavior: 'smooth' });
};
const scrollRight = () => {
   scrollEl.value?.scrollBy({ left: 200, behavior: 'smooth' });
};

// 获取我的发布题目
type ProblemsType = Awaited<ReturnType<typeof $trpc.admin.problem.list.query>>;
const problems = ref<ProblemsType | null>(null);
const { startViewTransition } = useViewTransition();
let requestId = 0;
const getMyPublishProblems = async () => {
   let id = ++requestId;
   const result = await $trpc.admin.problem.list.query({
      tids: selectedTags.value,
   });
   if (id !== requestId) return; // 如果请求被取消，则不更新
   startViewTransition(() => {
      problems.value = result;
   });
};
onMounted(() => {
   getMyPublishProblems();
});

// 获取我的标签
type TagsType = Awaited<
   ReturnType<typeof $trpc.admin.tag.getTagsInMyPublished.query>
>;
const tags = ref<TagsType | null>(null);
const getMyTags = async () => {
   tags.value = await $trpc.admin.tag.getTagsInMyPublished.query();
   nextTick(checkOverflow);
};
onMounted(getMyTags);

// 组件
const PublishDate = ({ problem }: { problem: ProblemsType[number] }) => {
   return (
      <div class='font-bold font-family-manrope leading-[90%]'>
         {problem.createdAt.split('T')[0]}
      </div>
   );
};
const ProblemStatus = ({ problem }: { problem: ProblemsType[number] }) => {
   const statusMap: Record<$Enums.Status, string> = {
      draft: '审核中',
      invalid: '审核失败',
      ready: '审核通过',
      published: '已发布',
   };
   const colorClass: Record<$Enums.Status, string> = {
      draft: 'text-warning',
      invalid: 'text-error',
      ready: 'text-success',
      published: 'text-secondary',
   };
   return (
      <div class={`font-bold leading-[90%] ${colorClass[problem.status]}`}>
         {statusMap[problem.status]}
      </div>
   );
};

// 选中标签
const selectedTags = ref<number[]>([]);
const toggleTag = (id: number) => {
   const idx = selectedTags.value.indexOf(id);
   idx === -1 ? selectedTags.value.push(id) : selectedTags.value.splice(idx, 1);
   getMyPublishProblems();
};
const selectAll = () => {
   selectedTags.value = [];
   getMyPublishProblems();
};

const showEmptyStatus = computed(() => {
   return Array.isArray(problems.value) && problems.value.length === 0;
});
</script>

<template>
   <StSpace
      fill-y
      direction="vertical"
      align="center"
      gap="0"
      class="overflow-auto hide-scrollbar">
      <StSpace
         v-if="showEmptyStatus"
         fill-y
         direction="vertical"
         class="mt-6 w-[50rem]">
         <h1 class="text-[2.5rem] font-bold text-white">我的发布</h1>
         <Divider />
         <StEmptyStatus content="暂无发布内容" class="pb-32 mt-24" />
      </StSpace>
      <StSpace v-else fill-y direction="vertical" class="mt-6 w-[65rem]">
         <h1 class="text-[2.5rem] font-bold text-white">我的发布</h1>
         <StSkeleton :loading="!tags" class="mt-4">
            <template #loading>
               <StSpace gap="0.75rem">
                  <StSkeletonItem
                     v-for="i in 3"
                     :key="i"
                     class="h-[3.5rem] w-32 !rounded-full" />
               </StSpace>
            </template>
            <StSpace fill-x class="h-[3.5rem] relative mt-4" gap="0">
               <div
                  :class="[
                     'absolute left-0 top-0 bottom-0 z-10 flex items-center justify-center bg-gradient-to-r from-background to-transparent pr-4 pl-1 transition-opacity duration-300',
                     arrivedState.left || !isOverflow
                        ? 'opacity-0 pointer-events-none'
                        : 'opacity-100',
                  ]">
                  <button
                     @click="scrollLeft"
                     class="w-8 h-8 rounded-full bg-[#2C2C2C] flex items-center justify-center hover:bg-[#3C3C3C] transition-colors cursor-pointer">
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
                     class="w-8 h-8 rounded-full bg-[#2C2C2C] flex items-center justify-center hover:bg-[#3C3C3C] transition-colors cursor-pointer">
                     <Right theme="outline" size="16" fill="#fff" />
                  </button>
               </div>
               <div class="h-[3.5rem]"></div>
            </StSpace>
         </StSkeleton>
         <Divider />
         <StSkeleton :loading="!problems" class="w-full h-full">
            <template #loading>
               <StGrid fill :cols="4" gap="1.25rem">
                  <StSkeletonItem
                     v-for="i in 12"
                     :key="i"
                     class="w-[14.5rem] h-[20rem]"
                     rounded="lg" />
               </StGrid>
            </template>
            <StGrid fill :cols="4" gap="1.25rem">
               <NuxtLink
                  v-for="(problem, idx) in problems"
                  class="h-fit"
                  :style="{ viewTransitionName: `card-${problem.pid}` }"
                  :key="idx"
                  :to="`/app/publish/problem/detail/${problem.pid}`">
                  <StProblemCard
                     class="w-[14.5rem] h-fit"
                     :cover-image-name="problem.imageName"
                     :cover-image-thumbhash="problem.imageHash"
                     :cover-image-thumbhash-url="problem.imageThumbhashUrl">
                     <StProblemCardTitle :title="problem.title" />
                     <StProblemCardTags :tags="problem.tags" />
                     <StProblemCardDivider />
                     <StProblemCardInfo class="px-2 pb-3">
                        <StProblemCardInfoItem title="提交时间">
                           <PublishDate :problem="problem" />
                        </StProblemCardInfoItem>
                        <StProblemCardInfoItem title="状态">
                           <ProblemStatus :problem="problem" />
                        </StProblemCardInfoItem>
                     </StProblemCardInfo>
                  </StProblemCard>
               </NuxtLink>
            </StGrid>
         </StSkeleton>
         <StSpacer fill flex no-shrink height="1rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
