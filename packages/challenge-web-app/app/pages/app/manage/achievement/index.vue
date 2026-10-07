<script setup lang="ts">
import { Box, GoldMedalTwo, PreviewOpen } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';
import { logger } from '~~/lib/logger';
import AchievementTableSkeleton from './_skeletons/AchievementTableSkeleton.vue';

useSeoMeta({ title: '成就管理 - Quanta Challenge' });

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

         <table class="!border-separate border-spacing-0 w-full table-fixed">
            <colgroup>
               <col style="width: 5rem" />
               <col style="width: 10rem" />
               <col style="width: auto" />
               <col style="width: 6rem" />
               <col style="width: 8rem" />
               <col style="width: 5rem" />
            </colgroup>

            <thead class="sticky top-[5.75rem]">
               <tr class="text-accent-700 text-nowrap whitespace-nowrap text-left">
                  <th class="bg-secondary pl-6 pr-3 py-[0.625rem] rounded-l-lg z-[10000]">
                     徽章
                  </th>
                  <th class="bg-secondary pr-3 py-[0.625rem]">成就名</th>
                  <th class="bg-secondary pr-3 py-[0.625rem]">描述</th>
                  <th class="bg-secondary pr-3 py-[0.625rem]">成就分</th>
                  <th class="bg-secondary pr-3 py-[0.625rem]">创建时间</th>
                  <th class="bg-secondary pr-6 py-[0.625rem] rounded-r-lg text-center">
                     操作
                  </th>
               </tr>
            </thead>

            <tbody v-if="pending">
               <AchievementTableSkeleton />
            </tbody>

            <tbody v-else>
               <template v-if="achievementList.length > 0">
                  <tr
                     v-for="achievement in achievementList"
                     :key="achievement.id"
                     class="text-left even:bg-accent-600">
                     <td class="pl-6 pr-3 py-4 rounded-l-lg">
                        <div
                           class="flex items-center justify-center size-[2.25rem] bg-accent-700 rounded-lg border border-accent-500 overflow-hidden">
                           <img
                              v-if="achievement.badgeUrl"
                              class="size-[1.75rem] object-contain"
                              :src="achievement.badgeUrl"
                              :alt="`${achievement.name} 成就徽章`" />
                           <Box v-else class="text-accent-400" />
                        </div>
                     </td>
                     <td class="pr-3 py-4 overflow-hidden">
                        <NuxtLink
                           :to="`/app/manage/achievement/detail/${achievement.id}`"
                           class="st-font-body-bold text-white truncate cursor-pointer hover:text-primary transition-colors">
                           {{ achievement.name }}
                        </NuxtLink>
                     </td>
                     <td class="pr-3 py-4 overflow-hidden">
                        <div class="st-font-body-normal text-accent-300 truncate">
                           {{ achievement.description || '暂无描述' }}
                        </div>
                     </td>
                     <td
                        class="pr-3 py-4 text-white font-family-manrope font-bold">
                        {{ achievement.score }}
                     </td>
                     <td class="pr-3 py-4 text-accent-300 font-family-manrope">
                        {{ achievement.createdAt }}
                     </td>
                     <td class="pr-6 py-4">
                        <StSpace align="center" justify="center">
                           <NuxtLink
                              :to="`/app/manage/achievement/detail/${achievement.id}`"
                              title="查看详情"
                              aria-label="查看详情"
                              class="flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 hover:text-secondary active:scale-95 transition-all cursor-pointer">
                              <PreviewOpen class="text-[1.25rem]" />
                           </NuxtLink>
                        </StSpace>
                     </td>
                  </tr>
               </template>

               <template v-else>
                  <tr>
                     <td colspan="6">
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
                     </td>
                  </tr>
               </template>
            </tbody>
         </table>
      </StSpace>
   </StSpace>
</template>
