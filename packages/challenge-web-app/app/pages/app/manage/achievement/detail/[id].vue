<script setup lang="ts">
import { Box, Return } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import { useMessage } from '~/components/st/Message/use-message';
import { logger } from '~~/lib/logger';

const route = useRoute();
const id = Number(route.params.id);
if (!id || Number.isNaN(id)) {
   navigateTo('/app/manage/achievement');
}

useSeoMeta({ title: computed(() => `成就详情 #${id} - Quanta Challenge`) });

const { $trpc } = useNuxtApp();
const message = useMessage();
const runtimeConfig = useRuntimeConfig();
const appBaseUrl = runtimeConfig.public.appBaseUrl;

type AchievementDetail = Awaited<
   ReturnType<typeof $trpc.admin.achievement.getAchievementDetail.query>
>;
const detail = ref<AchievementDetail | null>(null);

const fetchDetail = async () => {
   try {
      detail.value = await $trpc.admin.achievement.getAchievementDetail.query({
         id,
      });
   } catch (error) {
      logger.error(error, '加载成就详情失败');
      message.error('加载失败', '成就不存在或已被删除');
      navigateTo('/app/manage/achievement');
   }
};
onMounted(fetchDetail);

const badgeUrl = computed(() =>
   detail.value ? `${appBaseUrl}${detail.value.badgeUrl}` : ''
);
const createdAt = computed(() =>
   detail.value ? dayjs(detail.value.createdAt).format('YYYY-MM-DD HH:mm:ss') : ''
);
const dependencyTypeText: Record<string, string> = {
   NUMERIC: '数值',
   BOOLEAN: '布尔',
   TEXT: '文本',
};

const handleReturn = () => {
   navigateTo('/app/manage/achievement');
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace direction="vertical" gap="1.5rem" class="w-[44rem] pb-[10rem] my-6">
         <StSpace align="center" justify="between" fill-x>
            <h1 class="st-font-hero-bold">成就详情</h1>
            <StButton
               theme="secondary"
               bordered
               class="py-[0.375rem] px-[1.25rem]"
               @click="handleReturn">
               <StSpace align="center" gap="0.5rem">
                  <Return class="text-[1.25rem]" />
                  <span>返回列表</span>
               </StSpace>
            </StButton>
         </StSpace>

         <StSkeleton :loading="!detail">
            <template #loading>
               <StSpace direction="vertical" gap="1.5rem" fill-x>
                  <StSkeletonItem class="w-full h-[9rem] rounded-lg" />
                  <StSkeletonItem class="w-full h-[7rem] rounded-lg" />
                  <StSkeletonItem class="w-full h-[7rem] rounded-lg" />
                  <StSkeletonItem class="w-full h-[16rem] rounded-lg" />
               </StSpace>
            </template>

            <!-- 基本信息 -->
            <StSpace
               direction="vertical"
               gap="2rem"
               fill-x
               class="p-4 rounded-lg border border-secondary">
               <StSpace align="center" gap="1.25rem">
                  <div
                     class="flex items-center justify-center size-[4.5rem] bg-accent-600 rounded-xl border border-accent-500 overflow-hidden shrink-0">
                     <img
                        v-if="badgeUrl"
                        class="size-[3.5rem] object-contain"
                        :src="badgeUrl"
                        :alt="`${detail?.name} 成就徽章`" />
                     <Box v-else class="text-accent-400 text-3xl" />
                  </div>
                  <StSpace direction="vertical" gap="0.25rem">
                     <div class="st-font-secondary-bold text-white">
                        {{ detail?.name }}
                     </div>
                     <div class="st-font-body-normal text-accent-300">
                        {{ detail?.description || '暂无描述' }}
                     </div>
                  </StSpace>
               </StSpace>

               <div class="grid grid-cols-3 gap-x-[1rem] gap-y-[2rem] w-full">
                  <StSpace direction="vertical" gap="0.5rem">
                     <div class="text-accent-200">成就 ID</div>
                     <div class="text-white font-bold font-family-manrope">
                        {{ detail?.id }}
                     </div>
                  </StSpace>
                  <StSpace direction="vertical" gap="0.5rem">
                     <div class="text-accent-200">成就分</div>
                     <div class="text-white font-bold font-family-manrope">
                        {{ detail?.score }}
                     </div>
                  </StSpace>
                  <StSpace direction="vertical" gap="0.5rem">
                     <div class="text-accent-200">签到成就</div>
                     <div class="text-white font-bold">
                        {{ detail?.isCheckinAchievement ? '是' : '否' }}
                     </div>
                  </StSpace>
                  <StSpace direction="vertical" gap="0.5rem">
                     <div class="text-accent-200">创建时间</div>
                     <div class="text-white font-bold font-family-manrope">
                        {{ createdAt }}
                     </div>
                  </StSpace>
                  <StSpace direction="vertical" gap="0.5rem">
                     <div class="text-accent-200">创建者</div>
                     <div class="text-white font-bold">
                        {{ detail?.authorName ?? '未知' }}
                     </div>
                  </StSpace>
                  <StSpace direction="vertical" gap="0.5rem">
                     <div class="text-accent-200">已获得人数</div>
                     <div class="text-white font-bold font-family-manrope">
                        {{ detail?.achievedUserCount }}
                     </div>
                  </StSpace>
               </div>
            </StSpace>

            <!-- 依赖数据 -->
            <StSpace direction="vertical" gap="0.75rem" fill-x>
               <div class="st-font-third-bold text-white">依赖数据</div>
               <StSpace
                  v-if="detail?.dependencyData.length"
                  direction="vertical"
                  gap="0.75rem"
                  fill-x>
                  <StSpace
                     v-for="loader in detail.dependencyData"
                     :key="loader.id"
                     fill-x
                     justify="between"
                     align="center"
                     class="p-4 bg-accent-600 rounded-[0.75rem] border border-accent-500">
                     <StSpace direction="vertical" gap="0.25rem">
                        <div class="st-font-body-bold text-white">
                           {{ loader.name }}
                        </div>
                        <div class="st-font-tooltip text-accent-300">
                           {{ loader.description || '暂无描述' }}
                        </div>
                     </StSpace>
                     <StSpace align="center" gap="0.5rem">
                        <StTag
                           :content="dependencyTypeText[loader.type] ?? loader.type"
                           color="#a6fb1d"
                           size="small" />
                        <StTag
                           :content="loader.isList ? '列表' : '单值'"
                           color="#FA7C0E"
                           size="small" />
                     </StSpace>
                  </StSpace>
               </StSpace>
               <StSpace
                  v-else
                  center
                  fill-x
                  class="py-8 bg-accent-600/30 rounded-[1rem] border border-dashed border-accent-500">
                  <StEmptyStatus content="暂无依赖数据" />
               </StSpace>
            </StSpace>

            <!-- 前置成就 -->
            <StSpace direction="vertical" gap="0.75rem" fill-x>
               <div class="st-font-third-bold text-white">前置成就</div>
               <StSpace
                  v-if="detail?.preAchievements.length"
                  gap="0.75rem"
                  wrap
                  fill-x>
                  <NuxtLink
                     v-for="pre in detail.preAchievements"
                     :key="pre.id"
                     :to="`/app/manage/achievement/detail/${pre.id}`"
                     class="flex items-center gap-3 p-3 pr-5 bg-accent-600 rounded-[0.75rem] border border-accent-500 hover:border-primary/50 transition-colors">
                     <div
                        class="flex items-center justify-center size-[2.25rem] bg-accent-700 rounded-lg border border-accent-500 overflow-hidden">
                        <img
                           class="size-[1.75rem] object-contain"
                           :src="`${appBaseUrl}${pre.badgeUrl}`"
                           :alt="`${pre.name} 成就徽章`" />
                     </div>
                     <span class="st-font-body-bold text-white">{{ pre.name }}</span>
                  </NuxtLink>
               </StSpace>
               <StSpace
                  v-else
                  center
                  fill-x
                  class="py-8 bg-accent-600/30 rounded-[1rem] border border-dashed border-accent-500">
                  <StEmptyStatus content="没有前置成就" />
               </StSpace>
            </StSpace>

            <!-- 检测脚本 -->
            <StSpace direction="vertical" gap="0.75rem" fill-x>
               <div class="st-font-third-bold text-white">检测脚本</div>
               <div
                  v-if="detail?.checkScript"
                  class="p-4 rounded-sm bg-accent-600 w-full overflow-auto">
                  <StCodePreview :code="detail.checkScript" />
               </div>
               <StSpace
                  v-else
                  center
                  fill-x
                  class="py-8 bg-accent-600/30 rounded-[1rem] border border-dashed border-accent-500">
                  <StEmptyStatus content="暂无检测脚本" />
               </StSpace>
            </StSpace>
         </StSkeleton>
      </StSpace>
   </StSpace>
</template>
