<script setup lang="ts">
import { Inbox, Refresh } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';
import { dialog } from '~/composables/use-dialog';
import { logger } from '~~/lib/logger';
import ResetTaskCard from './_components/ResetTaskCard.vue';

useSeoMeta({ title: '定时任务管理 - Quanta Challenge' });

const { $trpc } = useNuxtApp();
const message = useMessage();

const statusFilters: {
   label: string;
   value: 'ALL' | 'pending' | 'running' | 'done' | 'failed';
   color: string;
}[] = [
   { label: '全部', value: 'ALL', color: '#FA7C0E' },
   { label: '待执行', value: 'pending', color: '#FA7C0E' },
   { label: '执行中', value: 'running', color: '#38BDF8' },
   { label: '已完成', value: 'done', color: '#4ADE80' },
   { label: '失败', value: 'failed', color: '#EF4444' },
];

type StatusFilter = (typeof statusFilters)[number]['value'];
type TaskItem = Awaited<
   ReturnType<typeof $trpc.admin.scheduledTask.listAll.query>
>[number];

const activeFilter = ref<StatusFilter>('ALL');
const tasks = ref<TaskItem[]>([]);
const loading = ref(false);

const refresh = async (): Promise<void> => {
   loading.value = true;
   try {
      tasks.value = await atLeastTime(
         500,
         $trpc.admin.scheduledTask.listAll.query(
            activeFilter.value === 'ALL'
               ? {}
               : { status: activeFilter.value },
         ),
      );
   } catch (error) {
      logger.error(error, '获取定时任务列表失败');
      message.error('获取列表失败', '请稍后重试');
   } finally {
      loading.value = false;
   }
};

watch(activeFilter, () => {
   void refresh();
});

const cancelTask = async (task: TaskItem) => {
   const confirmed = await dialog.confirm({
      title: '取消任务',
      description: `将取消「${task.summary}」任务，到期后不再执行，操作无法撤回。`,
      variant: 'danger',
      confirmText: '取消任务',
      cancelText: '返回',
   });
   if (!confirmed) return;

   try {
      await $trpc.admin.scheduledTask.cancel.mutate({ id: task.id });
      message.success('已取消', '该任务到期后不会执行');
      await refresh();
   } catch (error) {
      logger.error(error, '取消定时任务失败');
      message.error(
         '取消失败',
         error instanceof Error ? error.message : '请稍后重试',
      );
   }
};

const retryTask = async (task: TaskItem) => {
   try {
      await $trpc.admin.scheduledTask.retry.mutate({ id: task.id });
      message.success('已重新入队', '任务将立即到期执行');
      await refresh();
   } catch (error) {
      logger.error(error, '重试定时任务失败');
      message.error(
         '重试失败',
         error instanceof Error ? error.message : '请稍后重试',
      );
   }
};

const removeTask = async (task: TaskItem) => {
   const confirmed = await dialog.confirm({
      title: '删除记录',
      description: `将删除「${task.summary}」的${
         statusFilters.find((filter) => filter.value === task.status)?.label ??
         ''
      }记录，仅清理历史，操作无法撤回。`,
      confirmText: '删除',
      cancelText: '返回',
   });
   if (!confirmed) return;

   try {
      await $trpc.admin.scheduledTask.remove.mutate({ id: task.id });
      message.success('已删除');
      await refresh();
   } catch (error) {
      logger.error(error, '删除定时任务记录失败');
      message.error(
         '删除失败',
         error instanceof Error ? error.message : '请稍后重试',
      );
   }
};

onMounted(() => {
   void refresh();
});
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-[44rem] pb-[10rem] my-6">
         <h1 class="st-font-hero-bold">定时任务管理</h1>

         <StSpace gap="0.75rem" class="w-full">
            <StSlideRadioGroup
               :options="statusFilters"
               v-model:value="activeFilter" />
            <StButton
               theme="secondary"
               :loading="loading"
               class="h-[3.5rem] w-[3.5rem] flex-none !py-0 !px-0 !rounded-[0.375rem]"
               @click="refresh">
               <template #icon="{ loading: refreshing }">
                  <Refresh
                     class="text-[1.25rem] text-black"
                     :class="{ 'animate-spin': refreshing }" />
               </template>
            </StButton>
         </StSpace>

         <StEmptyStatus
            v-if="tasks.length === 0"
            content="暂无定时任务"
            :icon="Inbox"
            class="opacity-60 py-20" />

         <ResetTaskCard
            v-for="task in tasks"
            :key="task.id"
            :task="task"
            @cancel="cancelTask(task)"
            @retry="retryTask(task)"
            @remove="removeTask(task)" />
      </StSpace>
   </StSpace>
</template>
