<script setup lang="ts">
import { Close, LoadingFour, Search } from '@icon-park/vue-next';
import { onClickOutside, useDebounceFn } from '@vueuse/core';
import type { FormItemStatus } from '../Form/type';

interface IProblemPickerProblem {
   pid: number;
   baseId: number;
   title: string;
   difficulty: string;
}

const difficultyLabels: Record<string, string> = {
   easy: '简单',
   medium: '中等',
   hard: '困难',
   very_hard: '非常困难',
};

const difficultyColorClasses: Record<string, string> = {
   easy: 'text-secondary',
   medium: 'text-warning',
   hard: 'text-primary',
   very_hard: 'text-error',
};

const props = withDefaults(
   defineProps<{
      placeholder?: string;
      outerClass?: any;
      status?: FormItemStatus;
      disabled?: boolean;
      /** 单选模式 */
      multiple?: boolean;
      max?: number;
      limit?: number;
      /** 模型存题目版本 pid，或稳定题号 baseId */
      valueKey?: 'pid' | 'baseId';
   }>(),
   { multiple: true, limit: 8, valueKey: 'pid' },
);

const emit = defineEmits<{
   select: [problem: IProblemPickerProblem];
}>();

/** 选中题目的 pid 或 baseId，由 valueKey 决定 */
const value = defineModel<number[]>('value', { default: () => [] });
const problemValue = (problem: IProblemPickerProblem) =>
   problem[props.valueKey];

const borderClass = computed(() =>
   props.status === 'error'
      ? '!border !border-error'
      : props.status === 'success'
        ? '!border !border-success'
        : '',
);

const { $trpc } = useNuxtApp();

const keyword = ref('');
const results = ref<IProblemPickerProblem[]>([]);
const loading = ref(false);
const opened = ref(false);
const activeIndex = ref(0);

/** 已选题目的展示信息 */
const selectedInfo = reactive(new Map<number, IProblemPickerProblem>());
const selectedProblems = computed(() =>
   value.value.map(
      (pid) =>
         selectedInfo.get(pid) ?? {
            pid,
            baseId: pid,
            title: `#${pid}`,
            difficulty: '',
         },
   ),
);

const reachedMax = computed(
   () => props.max !== undefined && value.value.length >= props.max,
);

const visibleResults = computed(() =>
   results.value.filter((problem) => !value.value.includes(problemValue(problem))),
);

let requestSeq = 0;
const search = useDebounceFn(async (q: string) => {
   const seq = ++requestSeq;
   try {
      const problems = await $trpc.admin.problem.search.query({
         keyword: q,
         limit: props.limit,
      });
      if (seq !== requestSeq) return;
      results.value = problems;
      activeIndex.value = 0;
   } catch {
      if (seq === requestSeq) results.value = [];
   } finally {
      if (seq === requestSeq) loading.value = false;
   }
}, 250);

watch(keyword, (q) => {
   const trimmed = q.trim();
   if (!trimmed) {
      requestSeq++;
      results.value = [];
      loading.value = false;
      return;
   }
   loading.value = true;
   opened.value = true;
   search(trimmed);
});

const inputRef = useTemplateRef<HTMLInputElement>('input');
const rootRef = useTemplateRef<HTMLElement>('root');
onClickOutside(rootRef, () => {
   opened.value = false;
});

const pick = (problem: IProblemPickerProblem) => {
   const selectedValue = problemValue(problem);
   selectedInfo.set(selectedValue, problem);
   value.value = props.multiple
      ? [...value.value, selectedValue]
      : [selectedValue];
   emit('select', problem);
   keyword.value = '';
   if (!props.multiple) opened.value = false;
   inputRef.value?.focus();
};

const remove = (pid: number) => {
   value.value = value.value.filter((item) => item !== pid);
};

const handleKeydown = (e: KeyboardEvent) => {
   const list = visibleResults.value;
   switch (e.key) {
      case 'ArrowDown':
         e.preventDefault();
         opened.value = true;
         if (list.length) activeIndex.value = (activeIndex.value + 1) % list.length;
         break;
      case 'ArrowUp':
         e.preventDefault();
         if (list.length)
            activeIndex.value = (activeIndex.value - 1 + list.length) % list.length;
         break;
      case 'Enter': {
         e.preventDefault();
         const problem = list[activeIndex.value];
         if (opened.value && problem && !reachedMax.value) pick(problem);
         break;
      }
      case 'Backspace':
         if (!keyword.value && value.value.length) {
            remove(value.value[value.value.length - 1]!);
         }
         break;
      case 'Escape':
         opened.value = false;
         break;
   }
};

watch(visibleResults, (list) => {
   if (activeIndex.value >= list.length) activeIndex.value = 0;
});

const showDropdown = computed(
   () => opened.value && !!keyword.value.trim() && !props.disabled,
);
</script>

<template>
   <div ref="root" class="relative w-full">
      <div
         class="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-4 px-4 rounded-lg text-accent-300 caret-primary transition-colors cursor-text"
         :class="[outerClass, borderClass, { 'opacity-60 !cursor-not-allowed': disabled }]"
         @click="inputRef?.focus()">
         <span
            v-for="problem in selectedProblems"
            :key="problemValue(problem)"
            class="flex items-center gap-1.5 h-6 pl-1 pr-1 rounded-md bg-accent-600 border border-accent-500 text-accent-100 st-font-caption leading-none">
            <span class="text-accent-400">#{{ problemValue(problem) }}</span>
            <span class="max-w-[12rem] truncate">
               {{ problem.title }}
            </span>
            <button
               type="button"
               :aria-label="`移除 ${problem.title}`"
               :disabled="disabled"
               class="flex items-center justify-center size-4 rounded hover:bg-accent-500 hover:text-error transition-colors cursor-pointer"
               @click.stop="remove(problemValue(problem))">
               <Close size="0.75rem" />
            </button>
         </span>
         <div class="flex flex-1 min-w-[8rem] h-6 items-center gap-2">
            <Search v-if="!selectedProblems.length" class="text-accent-400" />
            <input
               ref="input"
               v-model="keyword"
               type="text"
               autocomplete="off"
               :disabled="disabled || reachedMax"
               :placeholder="
                  reachedMax
                     ? `最多选择 ${max} 道题目`
                     : selectedProblems.length
                       ? ''
                       : placeholder ?? '输入题目标题搜索'
               "
               class="flex-1 min-w-0 h-6 bg-transparent border-none outline-none text-white placeholder:text-accent-300"
               @focus="opened = true"
               @keydown="handleKeydown" />
            <LoadingFour v-if="loading" class="animate-spin text-primary" />
         </div>
      </div>

      <Transition name="problem-picker-fade">
         <ul
            v-if="showDropdown"
            role="listbox"
            class="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-[18rem] overflow-y-auto p-1 rounded-lg border border-accent-500 bg-accent-600 shadow-2xl">
            <li
               v-if="loading && !visibleResults.length"
               class="px-3 py-4 text-center st-font-caption text-accent-400">
               搜索中…
            </li>
            <li
               v-else-if="!visibleResults.length"
               class="px-3 py-4 text-center st-font-caption text-accent-400">
               {{ results.length ? '匹配的题目都已选择' : '未找到相关题目' }}
            </li>
            <li
               v-for="(problem, index) in visibleResults"
               :key="problemValue(problem)"
               role="option"
               :aria-selected="index === activeIndex"
               class="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors"
               :class="index === activeIndex ? 'bg-accent-500' : 'hover:bg-accent-500/60'"
               @mouseenter="activeIndex = index"
               @mousedown.prevent="pick(problem)">
               <span
                  class="st-font-caption px-1.5 py-0.5 rounded border border-accent-500 text-accent-400 shrink-0">
                  #{{ problemValue(problem) }}
               </span>
               <div class="min-w-0 flex-1">
                  <div class="st-font-body-normal text-white truncate">
                     {{ problem.title }}
                  </div>
                  <div
                     v-if="difficultyLabels[problem.difficulty]"
                     class="st-font-caption truncate"
                     :class="difficultyColorClasses[problem.difficulty]">
                     {{ difficultyLabels[problem.difficulty] }}
                  </div>
               </div>
            </li>
         </ul>
      </Transition>
   </div>
</template>

<style scoped>
.problem-picker-fade-enter-active,
.problem-picker-fade-leave-active {
   transition:
      opacity 0.15s ease,
      transform 0.15s ease;
}

.problem-picker-fade-enter-from,
.problem-picker-fade-leave-to {
   opacity: 0;
   transform: translateY(-0.25rem);
}
</style>
