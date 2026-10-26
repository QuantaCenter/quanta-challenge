<script setup lang="ts">
import type { $Enums } from '@prisma/client';
import type { ISelectOption } from '~/components/st/Select/type';

const selected = defineModel<$Enums.Difficulty | ''>('value', {
   default: '',
});

const props = withDefaults(
   defineProps<{
      /** 抽屉等纵向布局内使用时占满整行 */
      fullWidth?: boolean;
   }>(),
   { fullWidth: false }
);

const difficultyOptions: ISelectOption[] = [
   { label: '全部难度', value: '' },
   { label: '简单', value: 'easy' },
   { label: '中等', value: 'medium' },
   { label: '困难', value: 'hard' },
   { label: '非常困难', value: 'very_hard' },
];

const difficultyColorMap: Record<string, string> = {
   '': 'text-accent-100',
   easy: 'text-secondary',
   medium: 'text-warning',
   hard: 'text-primary',
   very_hard: 'text-error',
};

const selectedLabel = computed(() => {
   const option = difficultyOptions.find((opt) => opt.value === selected.value);
   return option?.label ?? '全部难度';
});

const selectedColor = computed(() => {
   return difficultyColorMap[selected.value] ?? 'text-accent-100';
});

const selectRef = useTemplateRef('selectRef');
onMounted(() => {
   if (selectRef.value) {
      setTimeout(() => {
         selectRef.value!.updatePopper();
      }, 500);
   }
});
</script>

<template>
   <StSelect
      v-model:value="selected"
      :options="difficultyOptions"
      ref="selectRef"
      placeholder="难度"
      attach-to-body
      :outer-class="
         props.fullWidth
            ? 'bg-accent-600 !py-2.5 !px-4 h-[3.5rem] w-full !rounded-xl'
            : 'bg-accent-600 !py-2.5 !pr-4 !pl-4 h-[3.5rem] w-[9rem] shrink-0 !rounded-xl'
      "
      :options-container-class="
         props.fullWidth
            ? 'overflow-hidden border-accent-500'
            : '!w-[9rem] overflow-hidden border-accent-500'
      ">
      <template #selected-preview>
         <span :class="['font-medium', selectedColor]">
            {{ selectedLabel }}
         </span>
      </template>
      <template #option="{ item }">
         <div :class="difficultyColorMap[item.value]">
            {{ item.label }}
         </div>
      </template>
   </StSelect>
</template>
