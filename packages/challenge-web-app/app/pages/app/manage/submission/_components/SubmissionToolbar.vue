<script setup lang="ts">
import { CloseSmall, Search } from '@icon-park/vue-next';
import type { ISelectOption } from '~/components/st/Select/type';
import type { ResultFilter } from '../_composables/use-submission-management';

/** 最近提交工具栏：用户搜索 + 题目搜索 + 状态筛选 + 提交时间范围。 */
const userKeywordInput = defineModel<string>('userKeywordInput', {
  required: true,
});
const problemKeywordInput = defineModel<string>('problemKeywordInput', {
  required: true,
});
const result = defineModel<ResultFilter>('result', { required: true });
const startTimeInput = defineModel<string>('startTimeInput', {
  required: true,
});
const endTimeInput = defineModel<string>('endTimeInput', { required: true });

const props = defineProps<{
  resultOptions: ISelectOption[];
  refreshing: boolean;
}>();

/** 清空用户搜索框（交给防抖 watch 生效） */
const clearUserKeyword = () => {
  userKeywordInput.value = '';
};

/** StSelect 单选点「当前项」会 emit 空串表示取消选择，这里直接忽略。 */
const setResult = (value: unknown) => {
  if (value) result.value = value as ResultFilter;
};

const resultLabel = (value: ResultFilter) =>
  props.resultOptions.find((option) => option.value === value)?.label ??
  '全部状态';
</script>

<template>
  <StSpace fill-x justify="between" align="center" gap="1rem" class="flex-wrap">
    <StSpace align="center" gap="0.75rem" class="flex-wrap">
      <div
        class="flex items-center gap-2 bg-accent-600 rounded-xl px-4 h-[3.5rem] w-[11rem] shrink-0 transition-colors focus-within:ring-1 focus-within:ring-primary/50">
        <Search class="text-accent-300 text-lg shrink-0" />
        <input
          v-model="userKeywordInput"
          type="text"
          placeholder="搜索用户"
          class="flex-1 bg-transparent border-none outline-none text-white placeholder:text-accent-400 text-sm min-w-0" />
        <button
          v-if="userKeywordInput"
          type="button"
          aria-label="清空用户搜索"
          @click="clearUserKeyword"
          class="text-accent-300 hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-accent-500">
          <CloseSmall class="text-lg" />
        </button>
      </div>

      <div
        class="flex items-center gap-2 bg-accent-600 rounded-xl px-4 h-[3.5rem] w-[12rem] shrink-0 transition-colors focus-within:ring-1 focus-within:ring-primary/50">
        <Search class="text-accent-300 text-lg shrink-0" />
        <input
          v-model="problemKeywordInput"
          type="text"
          placeholder="搜索题目（标题 / ID）"
          class="flex-1 bg-transparent border-none outline-none text-white placeholder:text-accent-400 text-sm min-w-0" />
      </div>

      <StSelect
        :value="result"
        :options="resultOptions"
        attach-to-body
        placeholder="全部状态"
        outer-class="bg-accent-600 !py-2.5 !pr-4 !pl-4 h-[3.5rem] w-[8rem] shrink-0 !rounded-xl"
        options-container-class="!w-[8rem] overflow-hidden border-accent-500"
        @update:value="setResult">
        <template #selected-preview>
          <span class="text-white">{{ resultLabel(result) }}</span>
        </template>
        <template #option="{ item }">
          <div class="whitespace-nowrap">{{ item.label }}</div>
        </template>
      </StSelect>

      <input
        v-model="startTimeInput"
        type="datetime-local"
        title="提交时间起始"
        class="bg-accent-600 rounded-xl px-4 h-[3.5rem] w-[13rem] shrink-0 text-white text-sm border-none outline-none [color-scheme:dark] placeholder:text-accent-400 focus-within:ring-1 focus-within:ring-primary/50 transition-colors" />
      <span class="st-font-caption text-accent-300 shrink-0">至</span>
      <input
        v-model="endTimeInput"
        type="datetime-local"
        title="提交时间截止"
        class="bg-accent-600 rounded-xl px-4 h-[3.5rem] w-[13rem] shrink-0 text-white text-sm border-none outline-none [color-scheme:dark] placeholder:text-accent-400 focus-within:ring-1 focus-within:ring-primary/50 transition-colors" />
    </StSpace>

    <span v-if="refreshing" class="st-font-caption text-accent-300 shrink-0">
      加载中…
    </span>
  </StSpace>
</template>
