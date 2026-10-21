<script setup lang="ts">
import SubmissionToolbar from './_components/SubmissionToolbar.vue';
import SubmissionTable from './_components/SubmissionTable.vue';
import SubmissionPagination from './_components/SubmissionPagination.vue';
import SubmissionDetailDrawer from './_drawers/SubmissionDetailDrawer.vue';
import {
  SUBMISSION_PAGE_SIZE,
  useSubmissionManagement,
  type SubmissionRow,
} from './_composables/use-submission-management';

useSeoMeta({ title: '提交记录 - Quanta Challenge' });

const {
  userKeywordInput,
  problemKeywordInput,
  result,
  startTimeInput,
  endTimeInput,
  page,
  total,
  totalPages,
  isFiltering,
  isInitialLoading,
  isRefreshing,
  submissionList,
  resultOptions,
} = useSubmissionManagement();

const drawerOpened = ref(false);
const selectedRecordId = ref<number | null>(null);

const openDetail = (row: SubmissionRow) => {
  selectedRecordId.value = row.id;
  drawerOpened.value = true;
};
</script>

<template>
  <StSpace fill justify="center">
    <StSpace
      direction="vertical"
      gap="1.5rem"
      class="w-[76rem] pb-[10rem] my-6">
      <StSpace align="end" gap="1rem">
        <h1 class="st-font-hero-bold text-accent-100">最近提交</h1>
        <span
          class="st-font-caption text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full">
          共 {{ total }} 条记录
        </span>
      </StSpace>

      <SubmissionToolbar
        v-model:user-keyword-input="userKeywordInput"
        v-model:problem-keyword-input="problemKeywordInput"
        v-model:result="result"
        v-model:start-time-input="startTimeInput"
        v-model:end-time-input="endTimeInput"
        :result-options="resultOptions"
        :refreshing="isRefreshing" />

      <SubmissionTable
        :submissions="submissionList"
        :loading="isInitialLoading"
        :is-filtering="isFiltering"
        :skeleton-count="SUBMISSION_PAGE_SIZE"
        @row-click="openDetail" />

      <SubmissionPagination
        v-model:page="page"
        :total="total"
        :total-pages="totalPages" />
    </StSpace>

    <SubmissionDetailDrawer
      v-model:opened="drawerOpened"
      :record-id="selectedRecordId" />
  </StSpace>
</template>
