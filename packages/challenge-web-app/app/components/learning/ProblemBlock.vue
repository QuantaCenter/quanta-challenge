<script setup lang="ts">
import { CheckOne, CloseOne, Right } from '@icon-park/vue-next';
import {
   isProblemCompleted,
   type Difficulty,
   type LearningProblemRef,
} from '~/composables/use-learning';
import { useLearningVisits } from '~/composables/use-learning-visits';

/**
 * 正文里的题目块：文章正文写 `<Problem baseId={…} />` 的地方就渲染成它。
 *
 * 两种形态：
 *   · `variant="reader"`：文章页。反映**用户做题状态**——已完成（或引用已失效）
 *     显示对勾与绿色边框，未完成显示序号；可点进做题页。
 *   · `variant="source"`：编辑器预览。只给元信息，多一个「从正文里删掉」按钮。
 */
const props = withDefaults(
   defineProps<{
      problem: LearningProblemRef;
      /** 同一篇里第几道（未完成时显示序号） */
      index: number;
      variant?: 'reader' | 'source';
   }>(),
   { variant: 'reader' },
);

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
   easy: '简单',
   medium: '中等',
   hard: '困难',
   very_hard: '极难',
};

const DIFFICULTY_COLOR: Record<Difficulty, string> = {
   easy: '#14e87e',
   medium: '#ffbe31',
   hard: '#fa2f32',
   very_hard: '#fa2f32',
};

const isReader = computed(() => props.variant === 'reader');
const visits = useLearningVisits();
// 引用已被下架/删除：按已完成计入（设计文档 §8.8），且不给「去做题」入口；
// 否则看真实的做题记录（提交成功后写入）
const done = computed(
   () =>
      props.problem.unavailable ||
      isProblemCompleted(props.problem.baseId, visits.slice.value),
);
/**
 * 能不能点进去做题。
 *
 * 除了「题没下架」，还要求**题号有效**：`baseId` 缺失或不是正整数时不能拼链接，
 * 否则会出现 `/challenge/editor/by-base/NaN`（做题页拿不到 pid：
 * 既提交不了，也查不到提交记录）。
 */
const hasValidBaseId = computed(
   () => Number.isInteger(props.problem.baseId) && props.problem.baseId > 0,
);
const editable = computed(
   () => isReader.value && !props.problem.unavailable && hasValidBaseId.value,
);
// 用题号进：pid 会被「重新发布」换掉，baseId 不会（见 challenge/[...path].vue）
const to = computed(() => `/challenge/editor/by-base/${props.problem.baseId}`);

const emit = defineEmits<{ remove: [] }>();
</script>

<template>
   <component
      :is="editable ? 'a' : 'div'"
      :href="editable ? to : undefined"
      class="block my-6 p-4 rounded-[0.75rem] border-2 transition-colors"
      :class="[
         problem.unavailable
            ? 'border-dashed border-accent-500 bg-accent-600/40'
            : done
              ? 'border-success/40'
              : 'border-accent-500',
         editable ? 'cursor-pointer hover:border-secondary/70' : '',
         problem.unavailable ? 'cursor-not-allowed' : '',
      ]">
      <StSpace align="center" gap="0.75rem">
         <div
            class="shrink-0 flex items-center justify-center size-9 rounded-[0.5rem]"
            :class="
               problem.unavailable
                  ? 'bg-accent-500/50 text-accent-300'
                  : done
                    ? 'bg-success/15 text-success'
                    : 'bg-accent-500/70 text-accent-300'
            ">
            <CloseOne
               v-if="problem.unavailable"
               size="1.125rem"
               :strokeWidth="4" />
            <CheckOne v-else-if="done" size="1.125rem" :strokeWidth="4" />
            <span v-else class="st-font-tooltip font-family-manrope">
               {{ index + 1 }}
            </span>
         </div>

         <StSpace direction="vertical" gap="0.375rem" class="min-w-0 flex-1">
            <span
               class="st-font-body-bold truncate"
               :class="problem.unavailable ? 'text-accent-400' : 'text-accent-100'">
               {{ problem.title }}
            </span>
            <StSpace align="center" gap="0.5rem" class="flex-wrap">
               <StTag
                  v-if="problem.unavailable"
                  size="small"
                  color="#fa2f32"
                  content="该题目已下架" />
               <span
                  v-if="problem.unavailable"
                  class="st-font-tooltip text-error">
                  题目不可用
               </span>
               <template v-else>
                  <StTag
                     size="small"
                     :color="DIFFICULTY_COLOR[problem.difficulty]"
                     :content="DIFFICULTY_LABEL[problem.difficulty]" />
                  <span
                     class="st-font-tooltip text-accent-400 font-family-manrope">
                     {{ problem.totalScore }} 分
                  </span>
                  <span
                     v-if="isReader"
                     class="st-font-tooltip"
                     :class="done ? 'text-success' : 'text-accent-400'">
                     {{ done ? '已完成' : '未完成' }}
                  </span>
               </template>
            </StSpace>
         </StSpace>

         <Right
            v-if="editable"
            class="shrink-0 text-accent-400"
            size="1rem"
            :strokeWidth="3" />

         <button
            v-if="variant === 'source'"
            type="button"
            title="从正文里删掉这道题"
            aria-label="从正文里删掉这道题"
            class="shrink-0 flex items-center justify-center size-7 rounded-[0.375rem] text-accent-400 hover:bg-error/20 hover:text-error transition-colors cursor-pointer"
            @click.stop.prevent="emit('remove')">
            <svg
               viewBox="0 0 48 48"
               width="0.8125rem"
               height="0.8125rem"
               fill="none">
               <path
                  d="M10 10L38 38M38 10L10 38"
                  stroke="currentColor"
                  stroke-width="6"
                  stroke-linecap="round" />
            </svg>
         </button>
      </StSpace>
   </component>
</template>
