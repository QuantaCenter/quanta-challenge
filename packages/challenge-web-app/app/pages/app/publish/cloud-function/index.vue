<script setup lang="ts">
import CloudFunctionStatsGrid from '~/components/cloud-function/StatsGrid.vue';
import FunctionCard from './_components/FunctionCard.vue';
import NewFunctionTile from './_components/NewFunctionTile.vue';
import CreateFunctionDrawer from './_drawers/CreateFunctionDrawer.vue';
import { useMessage } from '~/components/st/Message/use-message';
import { logger } from '~~/lib/logger';

useSeoMeta({ title: '云函数发布 - Quanta Challenge' });

const { $trpc } = useNuxtApp();
const message = useMessage();

const {
   data: functions,
   pending,
   error,
   refresh,
} = useAsyncData('cloud-function-list', () =>
   $trpc.admin.cloudFunction.list.query({}),
);

watch(
   error,
   (newError) => {
      if (newError) {
         logger.error(newError, '加载云函数列表失败');
         message.error('云函数加载失败', '请稍后重试');
      }
   },
   { immediate: true },
);

const stats = computed(() => {
   const list = functions.value ?? [];
   return [
      { label: '云函数总数', value: list.length, color: 'text-white' },
      {
         label: '已发布',
         value: list.filter((item) => item.activeVersion).length,
         color: 'text-secondary',
      },
      {
         label: '已停用',
         value: list.filter((item) => !item.enabled).length,
         color: 'text-accent-300',
      },
   ];
});

const createOpened = ref(false);

const handleCreated = async (name: string) => {
   await refresh();
   await navigateTo(`/app/publish/cloud-function/${name}`);
};
</script>

<template>
   <StSpace fill justify="center">
      <StSpace
         direction="vertical"
         gap="2.5rem"
         class="w-[64rem] pb-[10rem] my-6">
         <!-- Hero -->
         <h1 class="w-full st-font-hero-bold text-accent-100">云函数发布</h1>

         <CloudFunctionStatsGrid :items="stats" />

         <!-- 加载骨架 -->
         <div v-if="pending" class="grid grid-cols-3 gap-4 w-full">
            <div
               v-for="i in 6"
               :key="i"
               class="h-[13.5rem] animate-pulse rounded-2xl bg-accent-600" />
         </div>

         <!-- 函数网格 -->
         <div v-else class="grid grid-cols-3 gap-4 w-full">
            <NewFunctionTile @click="createOpened = true" />

            <FunctionCard
               v-for="fn in functions ?? []"
               :key="fn.name"
               :fn="fn" />
         </div>

         <p
            v-if="!pending && (functions?.length ?? 0) === 0"
            class="w-full text-center st-font-caption text-accent-400">
            还没有云函数，点击「新建云函数」创建第一个
         </p>
      </StSpace>

      <CreateFunctionDrawer
         v-model:opened="createOpened"
         @created="handleCreated" />
   </StSpace>
</template>
