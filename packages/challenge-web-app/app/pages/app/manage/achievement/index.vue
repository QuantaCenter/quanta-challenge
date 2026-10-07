<script setup lang="ts">
import { Box, GoldMedalTwo, PreviewOpen } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';
import type { ITableColumn } from '~/components/st/Table/type';
import { logger } from '~~/lib/logger';

useSeoMeta({ title: '成就管理 - Quanta Challenge' });

const columns: ITableColumn[] = [
   {
      key: 'badge',
      title: '徽章',
      width: '5rem',
      skeletonClass: 'size-[2.25rem] rounded-lg',
   },
   { key: 'name', title: '成就名', width: '10rem' },
   { key: 'description', title: '描述', skeletonClass: 'h-5 w-[12rem] rounded-md' },
   {
      key: 'score',
      title: '成就分',
      width: '6rem',
      skeletonClass: 'h-5 w-[3rem] rounded-md',
   },
   { key: 'createdAt', title: '创建时间', width: '8rem' },
   {
      key: 'action',
      title: '操作',
      width: '5rem',
      align: 'center',
      skeletonClass: 'size-8 rounded-md mx-auto',
   },
];

const { $trpc } = useNuxtApp();
const message = useMessage();
const runtimeConfig = useRuntimeConfig();
const appBaseUrl = runtimeConfig.public.appBaseUrl;

const {
   data: achievements,
   pending,
   error,
} = useAsyncData('manage-achievements', () =>
   $trpc.admin.achievement.getAllAchievements.query()
);

// 监听错误
watch(
   error,
   (newError) => {
      if (newError) {
         logger.error(newError, '加载成就失败');
         message.error('成就加载失败', '请检查网络连接或稍后重试');
      }
   },
   { immediate: true }
);

const achievementList = computed(() => {
   return (achievements.value ?? []).map((achievement) => ({
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      score: achievement.score,
      createdAt: achievement.createdAt.split('T')[0],
      badgeUrl: `${appBaseUrl}${achievement.badgeUrl}`,
   }));
});
</script>

<template>
   <StSpace fill justify="center">
      <StSpace direction="vertical" gap="1.5rem" class="w-[44rem] pb-[10rem] my-6">
         <StSpace align="end" gap="1rem">
            <h1 class="st-font-hero-bold text-accent-100">成就管理</h1>
            <span
               class="st-font-caption text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full">
               共 {{ achievementList.length }} 个成就
            </span>
         </StSpace>

         <StTable
            :columns="columns"
            :rows="achievementList"
            :loading="pending"
            row-key="id"
            :skeleton-count="5">
            <template #cell-badge="{ row }">
               <div
                  class="flex items-center justify-center size-[2.25rem] bg-accent-700 rounded-lg border border-accent-500 overflow-hidden">
                  <img
                     v-if="row.badgeUrl"
                     class="size-[1.75rem] object-contain"
                     :src="row.badgeUrl"
                     :alt="`${row.name} 成就徽章`" />
                  <Box v-else class="text-accent-400" />
               </div>
            </template>

            <template #cell-name="{ row }">
               <NuxtLink
                  :to="`/app/manage/achievement/detail/${row.id}`"
                  class="block st-font-body-bold text-white truncate cursor-pointer hover:text-primary transition-colors">
                  {{ row.name }}
               </NuxtLink>
            </template>

            <template #cell-description="{ row }">
               <div class="st-font-body-normal text-accent-300 truncate">
                  {{ row.description || '暂无描述' }}
               </div>
            </template>

            <template #cell-score="{ row }">
               <span class="text-white font-family-manrope font-bold">
                  {{ row.score }}
               </span>
            </template>

            <template #cell-createdAt="{ row }">
               <span class="text-accent-300 font-family-manrope">
                  {{ row.createdAt }}
               </span>
            </template>

            <template #cell-action="{ row }">
               <StSpace align="center" justify="center">
                  <NuxtLink
                     :to="`/app/manage/achievement/detail/${row.id}`"
                     title="查看详情"
                     aria-label="查看详情"
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
                  <GoldMedalTwo size="2.625rem" />
                  <div class="st-font-body-normal">暂无成就</div>
               </StSpace>
            </template>
         </StTable>
      </StSpace>
   </StSpace>
</template>
