<script setup lang="ts">
import { Delete, Time } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '~~/server/trpc/routes';

type RouterOutput = inferRouterOutputs<AppRouter>;
type ResetTaskItem =
  RouterOutput['admin']['scheduledTask']['listAll'][number];

const props = defineProps<{ task: ResetTaskItem }>();

const emit = defineEmits<{
  cancel: [];
  retry: [];
  remove: [];
}>();

const statusOptions: Record<string, { label: string; color: string }> = {
  pending: { label: '待执行', color: '#FA7C0E' },
  running: { label: '执行中', color: '#38BDF8' },
  done: { label: '已完成', color: '#4ADE80' },
  failed: { label: '失败', color: '#EF4444' },
};

const handlerLabels: Record<string, string> = {
  'reset-problems': '重置题目',
  'send-notification': '发送通知',
};

const formatTime = (time: string | Date | null) =>
  time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '—';
</script>

<template>
  <StSpace
    direction="vertical"
    gap="0.375rem"
    class="p-4 border border-accent-300 rounded-[0.5rem] w-full">
    <StSpace justify="between" align="center" fill-x>
      <StSpace gap="0.5rem" align="center">
        <StTag
          size="small"
          :content="statusOptions[task.status]?.label ?? task.status"
          :color="statusOptions[task.status]?.color" />
        <span class="st-font-body-normal">
          {{ handlerLabels[task.handlerId] ?? task.handlerId }}
        </span>
        <span class="st-font-body-normal text-accent-300">
          {{ task.summary }}
        </span>
      </StSpace>
      <StSpace gap="0.375rem" align="center">
        <StButton
          v-if="task.status === 'pending'"
          theme="danger"
          class="py-[0.125rem] px-[0.75rem] !rounded-[0.375rem]"
          @click="emit('cancel')">
          取消
        </StButton>
        <StButton
          v-if="task.status === 'failed'"
          theme="primary"
          class="py-[0.125rem] px-[0.75rem] !rounded-[0.375rem]"
          @click="emit('retry')">
          <div class="flex gap-1 items-center">
            <Time class="text-[1rem]" />
            <span>重试</span>
          </div>
        </StButton>
        <StButton
          v-if="task.status === 'done' || task.status === 'failed'"
          theme="secondary"
          class="py-[0.275rem] px-[0.75rem] !rounded-[0.25rem]"
          @click="emit('remove')">
          <Delete class="text-[0.8rem] text-accent-600" />
        </StButton>
      </StSpace>
    </StSpace>
    <StSpace
      v-if="task.users.length > 0"
      wrap
      gap="0.375rem"
      align="center"
      class="st-font-caption">
      <span
        v-for="user in task.users"
        :key="user.name"
        class="flex items-center gap-1.5 h-6 pl-1 pr-1.5 rounded-md bg-accent-600 border border-accent-500 text-accent-100 leading-none">
        <StAvatar :url="user.avatarUrl ?? undefined" size="1rem" />
        <span class="max-w-[10rem] truncate">
          {{ user.displayName || user.name }}
        </span>
        <span
          v-if="user.displayName && user.displayName !== user.name"
          class="text-accent-400">
          @{{ user.name }}
        </span>
      </span>
      <span
        v-for="problem in task.problems"
        :key="problem.pid"
        class="flex items-center gap-1.5 h-6 pl-1 pr-1.5 rounded-md bg-accent-600 border border-accent-500 text-accent-100 leading-none">
        <span class="text-accent-400">#{{ problem.pid }}</span>
        <span class="max-w-[12rem] truncate">
          {{ problem.title }}
        </span>
      </span>
    </StSpace>
    <StSpace gap="1rem" class="st-font-caption text-accent-300">
      <span>预定：{{ formatTime(task.runAt) }}</span>
      <span>创建：{{ formatTime(task.createdAt) }}</span>
      <span v-if="task.executedAt">
        执行：{{ formatTime(task.executedAt) }}
      </span>
      <span v-if="task.attempts > 1">已尝试 {{ task.attempts }} 次</span>
    </StSpace>
    <span v-if="task.error" class="st-font-caption text-error">
      {{ task.error }}
    </span>
  </StSpace>
</template>
