<script setup lang="ts">
import { BookOne, Check, Close, PreviewOpen } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';
import type { ITableColumn } from '~/components/st/Table/type';
import type { ITagOverflowItem } from '~/components/st/TagOverflow/type';

useSeoMeta({ title: '专题审核 - Quanta Challenge' });

const pendingColumns: ITableColumn[] = [
   { key: 'name', title: '专题', skeletonClass: 'h-5 w-[5.5rem] rounded-md' },
   { key: 'author', title: '作者', width: '4rem' },
   {
      key: 'submittedAt',
      title: '提交时间',
      width: '9rem',
      skeletonClass: 'h-5 w-[6.5rem] rounded-md',
   },
   {
      key: 'articleCount',
      title: '文章数',
      width: '4rem',
      align: 'center',
      skeletonClass: 'h-5 w-[2.5rem] rounded-md mx-auto',
   },
   {
      key: 'problemCount',
      title: '题目数',
      width: '4rem',
      align: 'center',
      skeletonClass: 'h-5 w-[2.5rem] rounded-md mx-auto',
   },
   {
      key: 'prerequisites',
      title: '前置专题',
      width: '8rem',
      skeletonClass: 'h-6 w-[4rem] rounded-md',
   },
   {
      key: 'action',
      title: '操作',
      width: '6.75rem',
      align: 'center',
      skeletonClass: 'size-5 rounded-md mx-auto',
   },
];

const publishedColumns: ITableColumn[] = [
   { key: 'name', title: '专题', skeletonClass: 'h-5 w-[8rem] rounded-md' },
   { key: 'author', title: '作者', width: '4rem' },
   {
      key: 'publishedAt',
      title: '发布时间',
      width: '9rem',
      skeletonClass: 'h-5 w-[6.5rem] rounded-md',
   },
   {
      key: 'articleCount',
      title: '文章数',
      width: '4rem',
      align: 'center',
      skeletonClass: 'h-5 w-[2.5rem] rounded-md mx-auto',
   },
   {
      key: 'action',
      title: '操作',
      width: '5rem',
      align: 'center',
      skeletonClass: 'size-8 rounded-md mx-auto',
   },
];

const message = useMessage();

const pending = [
   {
      id: 101,
      name: '网络与请求',
      description: 'HTTP 基础、缓存、跨域，以及 fetch 的常见坑。',
      author: 'felix',
      submittedAt: '2026-10-08 13:20',
      articleCount: 4,
      problemCount: 11,
      prerequisites: ['JavaScript'],
   },
   {
      id: 102,
      name: '构建工具',
      description: '从零理解打包、转换与产物优化。',
      author: 'admin',
      submittedAt: '2026-10-07 20:05',
      articleCount: 2,
      problemCount: 5,
      prerequisites: ['JavaScript', 'CSS'],
   },
];

const published = [
   {
      id: 1,
      name: 'HTML',
      author: 'felix',
      publishedAt: '2026-10-01 10:00',
      articleCount: 2,
   },
   {
      id: 2,
      name: 'CSS',
      author: 'felix',
      publishedAt: '2026-10-02 15:30',
      articleCount: 3,
   },
];

const prerequisiteChipClass =
   'rounded-md bg-accent-500 px-1.5 py-0.5 text-[0.75rem] text-accent-200';
const prerequisiteCounterClass =
   'rounded-md bg-accent-500 px-1.5 py-0.5 text-[0.75rem] text-accent-300';

const prerequisiteItems = (names: string[]): ITagOverflowItem[] =>
   names.map((name) => ({
      key: name,
      label: name,
      class: prerequisiteChipClass,
   }));

const act = (action: '通过' | '驳回', name: string) =>
   message.info(`静态预览：${action}`, `「${name}」的审核动作还没接后端`);
</script>

<template>
   <StSpace fill justify="center">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-[44rem] pb-[10rem] my-6">
         <StSpace align="end" gap="1rem">
            <h1 class="st-font-hero-bold text-accent-100">专题审核</h1>
            <span
               class="st-font-caption text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full">
               共 {{ pending.length + published.length }} 个专题
            </span>
         </StSpace>

         <StSpace direction="vertical" gap="1rem" fill-x>
            <StSpace align="center" gap="0.625rem">
               <BookOne class="text-[1.375rem] text-accent-200" />
               <h2 class="st-font-third-bold text-white">待审核</h2>
               <span
                  class="st-font-tooltip text-accent-300 bg-accent-600 px-2 py-0.5 rounded-full">
                  {{ pending.length }} 个
               </span>
            </StSpace>

            <StTable
               :columns="pendingColumns"
               :rows="pending"
               row-key="id"
               :skeleton-count="2">
               <template #cell-name="{ row }">
                  <StPopover :content="row.description" placement="top">
                     <span class="block st-font-body-bold text-white truncate">
                        {{ row.name }}
                     </span>
                  </StPopover>
               </template>

               <template #cell-author="{ row }">
                  <span
                     class="st-font-caption text-accent-300 font-family-manrope truncate">
                     {{ row.author }}
                  </span>
               </template>

               <template #cell-submittedAt="{ row }">
                  <span
                     class="st-font-caption text-accent-300 font-family-manrope">
                     {{ row.submittedAt }}
                  </span>
               </template>

               <template #cell-articleCount="{ row }">
                  <span class="text-white font-family-manrope">
                     {{ row.articleCount }}
                  </span>
               </template>

               <template #cell-problemCount="{ row }">
                  <span class="text-white font-family-manrope">
                     {{ row.problemCount }}
                  </span>
               </template>

               <template #cell-prerequisites="{ row }">
                  <StTagOverflow
                     :items="prerequisiteItems(row.prerequisites)"
                     :gap="4"
                     :counter-class="prerequisiteCounterClass" />
               </template>

               <template #cell-action="{ row }">
                  <StSpace align="center" justify="center" gap="1.25rem">
                     <button
                        type="button"
                        title="驳回"
                        aria-label="驳回"
                        class="flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 hover:text-error active:scale-95 transition-all cursor-pointer"
                        @click="act('驳回', row.name)">
                        <Close class="text-[1.25rem]" />
                     </button>
                     <button
                        type="button"
                        title="通过"
                        aria-label="通过"
                        class="flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 hover:text-secondary active:scale-95 transition-all cursor-pointer"
                        @click="act('通过', row.name)">
                        <Check class="text-[1.25rem]" />
                     </button>
                  </StSpace>
               </template>

               <template #empty>
                  <StSpace
                     fill
                     direction="vertical"
                     gap="0.75rem"
                     align="center"
                     justify="center"
                     class="text-accent-400 my-[20vh]">
                     <BookOne size="2.625rem" />
                     <div class="st-font-body-normal">暂无待审核专题</div>
                  </StSpace>
               </template>
            </StTable>
         </StSpace>

         <StSpace direction="vertical" gap="1rem" fill-x>
            <StSpace align="center" gap="0.625rem">
               <Check class="text-[1.375rem] text-accent-200" />
               <h2 class="st-font-third-bold text-white">已上架</h2>
               <span
                  class="st-font-tooltip text-accent-300 bg-accent-600 px-2 py-0.5 rounded-full">
                  {{ published.length }} 个
               </span>
            </StSpace>

            <StTable
               :columns="publishedColumns"
               :rows="published"
               row-key="id"
               :skeleton-count="2">
               <template #cell-name="{ row }">
                  <NuxtLink
                     :to="`/app/topics/${row.id}`"
                     class="block st-font-body-bold text-white truncate cursor-pointer hover:text-primary transition-colors">
                     {{ row.name }}
                  </NuxtLink>
               </template>

               <template #cell-author="{ row }">
                  <span
                     class="st-font-caption text-accent-300 font-family-manrope truncate">
                     {{ row.author }}
                  </span>
               </template>

               <template #cell-publishedAt="{ row }">
                  <span
                     class="st-font-caption text-accent-300 font-family-manrope">
                     {{ row.publishedAt }}
                  </span>
               </template>

               <template #cell-articleCount="{ row }">
                  <span class="text-white font-family-manrope">
                     {{ row.articleCount }}
                  </span>
               </template>

               <template #cell-action="{ row }">
                  <StSpace align="center" justify="center">
                     <NuxtLink
                        :to="`/app/topics/${row.id}`"
                        title="查看专题"
                        aria-label="查看专题"
                        class="flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 hover:text-secondary active:scale-95 transition-all cursor-pointer">
                        <PreviewOpen class="text-[1.25rem]" />
                     </NuxtLink>
                  </StSpace>
               </template>

               <template #empty>
                  <StSpace
                     fill
                     direction="vertical"
                     gap="0.75rem"
                     align="center"
                     justify="center"
                     class="text-accent-400 my-[20vh]">
                     <Check size="2.625rem" />
                     <div class="st-font-body-normal">暂无已上架专题</div>
                  </StSpace>
               </template>
            </StTable>
         </StSpace>
      </StSpace>
   </StSpace>
</template>
