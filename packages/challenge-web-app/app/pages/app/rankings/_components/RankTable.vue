<script setup lang="ts">
import { Lock } from '@icon-park/vue-next';
import type { ITableColumn } from '~/components/st/Table/type';
import type { IRanking } from '../_types';

useSeoMeta({
   title: '排行榜 - Quanta Challenge',
   description: '查看用户排行榜，了解排名和成绩。',
});

defineProps<{
   data: IRanking[];
   loading: boolean;
}>();

// 「正确率 / 通过次数」两列在移动端通过 CSS 隐藏（SSR 安全，避免水合前后列数不一致导致样式闪跳）
const columns: ITableColumn[] = [
   {
      key: 'rank',
      title: '排名',
      width: '6rem',
      cellAlign: 'center',
      skeletonClass: 'size-[2.25rem] rounded-full mx-auto',
   },
   { key: 'userName', title: '用户', skeletonClass: 'h-5 w-[12rem] rounded-md' },
   {
      key: 'score',
      title: '分数',
      width: '6rem',
      skeletonClass: 'h-5 w-[4.7rem] rounded-md',
      // 移动端最后两列被隐藏，分数列成为可见的最后一列，需接管右侧圆角与内边距
      class: 'max-md:rounded-r-lg max-md:pr-6',
   },
   {
      key: 'correctRate',
      title: '正确率',
      width: '6rem',
      skeletonClass: 'h-5 w-[5rem] rounded-md',
      class: 'max-md:hidden',
   },
   {
      key: 'passCount',
      title: '通过次数',
      width: '6rem',
      cellAlign: 'center',
      skeletonClass: 'h-5 w-[5rem] rounded-md mx-auto',
      class: 'max-md:hidden',
   },
];
</script>

<template>
   <StSpace class="w-full max-w-[48rem]">
      <StTable
         :columns="columns"
         :rows="data"
         :loading="loading"
         row-key="userId"
         :skeleton-count="50">
         <template #cell-rank="{ row }">
            <div
               class="flex items-center justify-center font-bold size-[2.25rem] rounded-full text-sm font-family-manrope"
               :class="{
                  'bg-[#FFBE31] text-accent-700': row.rank === 1,
                  'bg-[#CACACA] text-accent-700': row.rank === 2,
                  'bg-[#9E5C38] text-white': row.rank === 3,
                  'bg-accent-500 text-white': row.rank > 3,
               }">
               {{ row.rank }}
            </div>
         </template>

         <template #cell-userName="{ row }">
            <div class="flex items-center gap-3">
               <StImage
                  lazy
                  :src="row.imageUrl"
                  alt="avatar"
                  width="2.25rem"
                  height="2.25rem"
                  object="cover"
                  class="rounded-lg" />
               <NuxtLink
                  :to="`/app/space/${row.uid}`"
                  class="st-font-body-bold text-white cursor-pointer hover:text-primary transition-all">
                  {{ row.userName }}
               </NuxtLink>
            </div>
         </template>

         <template #cell-score="{ row }">
            <span class="text-white font-family-manrope font-bold">
               {{ row.score }}
            </span>
         </template>

         <template #cell-correctRate="{ row }">
            <span class="text-white font-family-manrope">
               {{ row.correctRate.toFixed(2) }}%
            </span>
         </template>

         <template #cell-passCount="{ row }">
            <span class="text-white font-family-manrope">
               {{ row.passCount }}
            </span>
         </template>

         <template #empty>
            <StSpace
               fill
               direction="vertical"
               gap="0.75rem"
               align="center"
               justify="center"
               class="text-accent-400 my-[20vh]">
               <Lock size="2.625rem" />
               <div class="st-font-body-normal">排名未解锁</div>
            </StSpace>
         </template>
      </StTable>
   </StSpace>
</template>
