<script setup lang="ts">
import {
  CheckSmall,
  CloseSmall,
  History,
  LoadingFour,
} from '@icon-park/vue-next';
import type { ITableColumn } from '~/components/st/Table/type';
import type { SubmissionRow } from '../_composables/use-submission-management';

const props = defineProps<{
  submissions: SubmissionRow[];
  loading: boolean;
  isFiltering: boolean;
  skeletonCount: number;
}>();

const emits = defineEmits<{
  rowClick: [row: SubmissionRow];
}>();

const columns: ITableColumn[] = [
  // 记录 ID / 判题耗时 / 提交时间三列在移动端通过 CSS 隐藏（SSR 安全，避免水合前后列数不一致）
  { key: 'id', title: '记录 ID', width: '6rem', align: 'center', skeletonClass: 'h-5 w-[4rem] rounded-md mx-auto', class: 'max-md:hidden' },
  { key: 'user', title: '用户', skeletonClass: 'h-9 w-[9rem] rounded-lg' },
  { key: 'problem', title: '题目', skeletonClass: 'h-9 w-[12rem] rounded-lg' },
  { key: 'result', title: '状态', width: '6.5rem', align: 'center', skeletonClass: 'h-5 w-[4rem] rounded-md mx-auto' },
  // 移动端最后三列被隐藏，得分列成为可见的最后一列，需接管右侧圆角与内边距
  { key: 'score', title: '得分', width: '5rem', align: 'center', skeletonClass: 'h-5 w-[2.5rem] rounded-md mx-auto', class: 'max-md:rounded-r-lg max-md:pr-6' },
  { key: 'judgingTime', title: '判题耗时', width: '7rem', align: 'center', skeletonClass: 'h-5 w-[4.5rem] rounded-md mx-auto', class: 'max-md:hidden' },
  { key: 'submittedAt', title: '提交时间', width: '11.5rem', align: 'center', skeletonClass: 'h-5 w-[8rem] rounded-md mx-auto', class: 'max-md:hidden' },
];

const statusMeta = (result: SubmissionRow['result']) => {
  if (result === 'success') {
    return { text: '通过', color: 'text-success' };
  }
  if (result === 'failed') {
    return { text: '未通过', color: 'text-error' };
  }
  return { text: '评测中', color: 'text-warning' };
};
</script>

<template>
  <StTable
    :columns="columns"
    :rows="submissions"
    :loading="loading"
    row-key="id"
    clickable-rows
    :skeleton-count="skeletonCount"
    @row-click="(row: SubmissionRow) => emits('rowClick', row)">
    <template #cell-id="{ row }">
      <span class="text-accent-200 font-family-manrope">#{{ row.id }}</span>
    </template>

    <template #cell-user="{ row }">
      <div class="flex items-center gap-3">
        <StImage
          lazy
          :src="row.avatarUrl"
          :alt="`${row.displayName} 头像`"
          width="2.25rem"
          height="2.25rem"
          object="cover"
          class="rounded-lg shrink-0" />
        <div class="flex flex-col overflow-hidden">
          <span class="st-font-body-bold text-white truncate">
            {{ row.displayName }}
          </span>
          <span class="st-font-caption text-accent-300 truncate">
            @{{ row.userName }}
          </span>
        </div>
      </div>
    </template>

    <template #cell-problem="{ row }">
      <div class="flex flex-col overflow-hidden">
        <span class="st-font-body-bold text-white truncate">
          {{ row.problemTitle }}
        </span>
        <span class="st-font-caption text-accent-300 font-family-manrope">
          PID {{ row.problemPid }}
        </span>
      </div>
    </template>

    <template #cell-result="{ row }">
      <StSpace :class="statusMeta(row.result).color" gap="0.25rem" align="center" class="justify-center">
        <LoadingFour v-if="row.result === 'pending'" class="animate-spin text-lg" />
        <CheckSmall v-else-if="row.result === 'success'" class="text-lg" />
        <CloseSmall v-else class="text-lg" />
        <span class="st-font-body-bold">{{ statusMeta(row.result).text }}</span>
      </StSpace>
    </template>

    <template #cell-score="{ row }">
      <span class="text-white font-family-manrope font-bold">
        {{ row.score }}
      </span>
    </template>

    <template #cell-judgingTime="{ row }">
      <span class="text-accent-200 font-family-manrope">
        {{ row.judgingTime }}ms
      </span>
    </template>

    <template #cell-submittedAt="{ row }">
      <span class="text-accent-300 font-family-manrope">
        {{ row.submittedAt }}
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
        <History size="2.625rem" />
        <div class="st-font-body-normal">
          {{ isFiltering ? '没有匹配的提交记录' : '暂无提交记录' }}
        </div>
      </StSpace>
    </template>
  </StTable>
</template>
