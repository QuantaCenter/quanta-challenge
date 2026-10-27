<script setup lang="ts">
import { CheckOne, ErrorPicture, Share } from '@icon-park/vue-next';
import { isProblemCompleted } from '~/utils/learning-progress';
import {
   type Difficulty,
   type LearningProblemRef,
} from '~/composables/use-learning';
import { useLearningVisits } from '~/composables/use-learning-visits';

/**
 * 正文里的题目块：文章正文写 `<Problem baseId={…} />` 的地方就渲染成它。
 *
 * 形态对齐 `LearningArticleRow`（左封面、右标题 / 标签 / 信息三栏），
 * 让题目在正文里看起来和文章列表里的条目是一类东西。
 *
 * 两种形态：
 *   · `variant="reader"`：文章页。反映**用户做题状态**——已完成（或引用已失效）
 *     显示对勾与绿色文字；可点进做题页。
 *   · `variant="source"`：编辑器预览。只给元信息，多一个「从正文里删掉」按钮。
 */
const props = withDefaults(
   defineProps<{
      problem: LearningProblemRef;
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
 * 除了「题没下架」，还要求**版本号有效**：服务端实时把 baseId 解析成
 * 当前已发布的 pid（见 `learning-read.ts` 的 resolveProblemState），
 * 解析不出 pid（未发布/不存在）时不能拼链接。
 */
const hasValidPid = computed(
   () => Number.isInteger(props.problem.pid) && props.problem.pid > 0,
);
const editable = computed(
   () => isReader.value && !props.problem.unavailable && hasValidPid.value,
);
const to = computed(() => `/challenge/editor/${props.problem.pid}`);

const coverSrc = computed(() =>
   props.problem.imageName ? `/api/static/${props.problem.imageName}` : '',
);

const emit = defineEmits<{ remove: [] }>();
</script>

<template>
   <component
      :is="editable ? 'a' : 'div'"
      :href="editable ? to : undefined"
      class="group my-6 flex w-full items-stretch gap-4 rounded-[0.75rem] border p-3 transition-colors"
      :class="[
         problem.unavailable
            ? 'border-dashed border-accent-500 bg-accent-600/40'
            : 'border-accent-500',
         editable ? 'cursor-pointer hover:border-secondary/70' : '',
         problem.unavailable ? 'cursor-not-allowed' : '',
      ]">
      <!-- 封面：与文章条目同比例（16:10），高度略低 -->
      <div
         class="relative h-[7rem] w-[11.2rem] shrink-0 overflow-hidden rounded-[0.375rem] ring-1 ring-white/5">
         <div
            class="size-full transition-transform duration-300"
            :class="editable ? 'group-hover:scale-[1.03]' : ''">
            <StImage
               :src="coverSrc"
               :thumbhash="problem.imageHash ?? undefined"
               :thumbhash-url="problem.imageThumbhashUrl ?? undefined"
               width="100%"
               height="100%"
               object="cover"
               alt="题目封面">
               <template #fallback="{ style }">
                  <div
                     class="flex size-full items-center justify-center bg-accent-600/75 text-accent-500"
                     :style="style">
                     <ErrorPicture size="2rem" />
                  </div>
               </template>
            </StImage>
         </div>
         <div
            class="absolute inset-0 bg-background/5 transition-colors"
            :class="editable ? 'group-hover:bg-background/20' : ''" />
      </div>

      <!-- 信息：标题 / 标签 / 状态三栏 -->
      <div class="flex min-w-0 flex-1 flex-col justify-between gap-2">
         <!-- 第一栏：标题 + 跳转入口靠最右 -->
         <div class="flex items-start gap-3">
            <h3
               class="min-w-0 flex-1 text-[1.25rem] font-bold leading-snug line-clamp-1 transition-colors"
               :class="[
                  problem.unavailable ? 'text-accent-400' : 'text-white',
                  editable ? 'group-hover:text-secondary' : '',
               ]">
               {{ problem.title }}
            </h3>

            <button
               v-if="variant === 'source'"
               type="button"
               title="从正文里删掉这道题"
               aria-label="从正文里删掉这道题"
               class="flex size-7 shrink-0 items-center justify-center rounded-[0.375rem] text-accent-400 transition-colors hover:bg-error/20 hover:text-error cursor-pointer"
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

            <Share
               v-if="editable"
               class="shrink-0 text-accent-400 transition-colors group-hover:text-secondary"
               size="1rem"
               :strokeWidth="3" />
         </div>

         <!-- 第二栏：标签 -->
         <div
            class="flex flex-wrap items-center gap-2 st-font-caption text-accent-400">
            <StTag
               v-if="problem.unavailable"
               size="small"
               color="#fa2f32"
               content="该题目已下架" />
            <template v-else>
               <StTag
                  size="small"
                  :color="DIFFICULTY_COLOR[problem.difficulty]"
                  :content="DIFFICULTY_LABEL[problem.difficulty]" />
               <StTag
                  v-for="tag in problem.tags ?? []"
                  :key="tag.name"
                  size="small"
                  :color="tag.color ?? undefined"
                  :content="tag.name" />
            </template>
         </div>

         <!-- 第三栏：分值 / 完成状态 -->
         <div
            class="flex flex-wrap items-center gap-2 st-font-caption text-accent-400">
            <span v-if="problem.unavailable" class="text-error">
               题目不可用
            </span>
            <template v-else>
               <span class="font-family-manrope">
                  {{ problem.totalScore }} 分
               </span>
               <span
                  v-if="isReader"
                  class="flex items-center gap-1"
                  :class="done ? 'text-success' : 'text-accent-400'">
                  <CheckOne v-if="done" size="0.875rem" :strokeWidth="3" />
                  {{ done ? '已完成' : '未完成' }}
               </span>
            </template>
         </div>
      </div>
   </component>
</template>
