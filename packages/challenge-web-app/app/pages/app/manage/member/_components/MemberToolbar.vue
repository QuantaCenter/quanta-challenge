<script setup lang="ts">
import { ArrowDown, ArrowUp, CloseSmall, Search } from '@icon-park/vue-next';
import type { ISelectOption } from '~/components/st/Select/type';
import type { RoleFilter, SortBy, SortOrder } from '../_utils/roles';

/** 成员管理工具栏：搜索 + 角色筛选 + 排序字段 + 升/降序切换。 */
const keywordInput = defineModel<string>('keywordInput', { required: true });
const role = defineModel<RoleFilter>('role', { required: true });
const sortBy = defineModel<SortBy>('sortBy', { required: true });

defineProps<{
   sortOrder: SortOrder;
   roleLabel: string;
   sortFieldLabel: string;
   sortOrderTip: string;
   roleOptions: { label: string; value: RoleFilter }[];
   sortFieldOptions: ISelectOption[];
   refreshing: boolean;
}>();

const emits = defineEmits<{
   clear: [];
   toggleSortOrder: [];
}>();

/** StSelect 单选点「当前项」会 emit 空串表示取消选择，这里直接忽略。 */
const setRole = (value: unknown) => {
   if (value) role.value = value as RoleFilter;
};

const setSortBy = (value: unknown) => {
   if (value) sortBy.value = value as SortBy;
};
</script>

<template>
   <StSpace fill-x justify="between" align="center" gap="1rem">
      <StSpace align="center" gap="0.75rem">
         <div
            class="flex items-center gap-2 bg-accent-600 rounded-xl px-4 h-[3.5rem] w-[16rem] shrink-0 transition-colors focus-within:ring-1 focus-within:ring-primary/50">
            <Search class="text-accent-300 text-lg shrink-0" />
            <input
               v-model="keywordInput"
               type="text"
               placeholder="搜索用户名 / 昵称 / 邮箱"
               class="flex-1 bg-transparent border-none outline-none text-white placeholder:text-accent-400 text-sm min-w-0" />
            <button
               v-if="keywordInput"
               type="button"
               aria-label="清空搜索"
               @click="emits('clear')"
               class="text-accent-300 hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-accent-500">
               <CloseSmall class="text-lg" />
            </button>
         </div>

         <StSelect
            :value="role"
            :options="roleOptions"
            attach-to-body
            placeholder="全部角色"
            outer-class="bg-accent-600 !py-2.5 !pr-4 !pl-4 h-[3.5rem] w-[10rem] shrink-0 !rounded-xl"
            options-container-class="!w-[10rem] overflow-hidden border-accent-500"
            @update:value="setRole">
            <template #selected-preview>
               <span class="text-white">{{ roleLabel }}</span>
            </template>
            <template #option="{ item }">
               <div class="whitespace-nowrap">{{ item.label }}</div>
            </template>
         </StSelect>

         <StSelect
            :value="sortBy"
            :options="sortFieldOptions"
            attach-to-body
            placeholder="排序字段"
            outer-class="bg-accent-600 !py-2.5 !pr-4 !pl-4 h-[3.5rem] w-[9.5rem] shrink-0 !rounded-xl"
            options-container-class="!w-[9.5rem] overflow-hidden border-accent-500"
            @update:value="setSortBy">
            <template #selected-preview>
               <span class="text-white">{{ sortFieldLabel }}</span>
            </template>
         </StSelect>

         <button
            type="button"
            :title="sortOrderTip"
            :aria-label="sortOrderTip"
            class="flex items-center justify-center size-[3.5rem] shrink-0 bg-accent-600 rounded-xl text-accent-300 hover:bg-accent-500 hover:text-white transition-colors cursor-pointer active:scale-95"
            @click="emits('toggleSortOrder')">
            <ArrowDown v-if="sortOrder === 'desc'" class="text-xl" />
            <ArrowUp v-else class="text-xl" />
         </button>
      </StSpace>

      <span v-if="refreshing" class="st-font-caption text-accent-300 shrink-0">
         加载中…
      </span>
   </StSpace>
</template>
