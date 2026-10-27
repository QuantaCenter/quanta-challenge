<script setup lang="ts">
import {
   User,
   Tag,
   Check,
   ChartProportion,
   Time,
   Fire,
   ListView,
   CalendarThirtyTwo,
   WebPage,
   GoldMedalTwo,
   VolumeNotice,
   History,
   Help,
   Code,
} from '@icon-park/vue-next';
import type { SearchResult } from '~/types/search';

const props = defineProps<{
   result: SearchResult;
   isSelected?: boolean;
}>();

const emit = defineEmits<{
   click: [result: SearchResult];
}>();

const { searchQuery } = useSearch();

// 标题按搜索关键词切分，用于高亮命中部分
const titleSegments = computed(() =>
   highlightSegments(props.result.title, searchQuery.value)
);

const icon = computed(() => {
   switch (props.result.type) {
      case 'problem':
         return ListView;
      case 'user':
         return User;
      case 'tag':
         return Tag;
      case 'daily-problem':
         return CalendarThirtyTwo;
      case 'page-section':
         return WebPage;
      case 'achievement':
         return GoldMedalTwo;
      case 'notification':
         return VolumeNotice;
      case 'submission':
         return History;
      case 'appeal':
         return Help;
      case 'cloud-function':
         return Code;
   }
});

const typeText = computed(() => {
   switch (props.result.type) {
      case 'problem':
         return '题目';
      case 'user':
         return '用户';
      case 'tag':
         return '标签';
      case 'daily-problem':
         return '每日一题';
      case 'page-section':
         return '页面';
      case 'achievement':
         return '成就';
      case 'notification':
         return '通知';
      case 'submission':
         return '提交';
      case 'appeal':
         return '申诉';
      case 'cloud-function':
         return '云函数';
   }
});

const appealStatusText = (status: string) => {
   switch (status) {
      case 'PENDING':
         return '待处理';
      case 'APPROVED':
         return '已通过';
      case 'REJECTED':
         return '已驳回';
      default:
         return status;
   }
};

const difficultyText = (difficulty: string) => {
   switch (difficulty) {
      case 'easy':
         return '简单';
      case 'medium':
         return '中等';
      case 'hard':
         return '困难';
      case 'very_hard':
         return '极难';
      default:
         return difficulty;
   }
};

const difficultyColor = (difficulty: string) => {
   switch (difficulty) {
      case 'easy':
         return 'bg-success/20 text-success';
      case 'medium':
         return 'bg-warning/20 text-warning';
      case 'hard':
         return 'bg-error/20 text-error';
      case 'very_hard':
         return 'bg-purple-500/20 text-purple-400';
      default:
         return 'bg-accent-600 text-accent-300';
   }
};

const typeColor = computed(() => {
   switch (props.result.type) {
      case 'problem':
         return 'text-primary';
      case 'user':
         return 'text-secondary';
      case 'tag':
         return 'text-success';
      case 'daily-problem':
         return 'text-warning';
      case 'page-section':
         return 'text-accent-100';
      case 'achievement':
         return 'text-amber-400';
      case 'notification':
         return 'text-purple-400';
      case 'submission':
         return 'text-orange-400';
      case 'appeal':
         return 'text-error';
      case 'cloud-function':
         return 'text-purple-400';
      default:
         return 'text-accent-300';
   }
});

const typeBgColor = computed(() => {
   switch (props.result.type) {
      case 'problem':
         return 'bg-primary/20 text-primary';
      case 'user':
         return 'bg-secondary/20 text-secondary';
      case 'tag':
         return 'bg-success/20 text-success';
      case 'daily-problem':
         return 'bg-warning/20 text-warning';
      case 'page-section':
         return 'bg-accent-500 text-accent-200';
      case 'achievement':
         return 'bg-amber-500/20 text-amber-400';
      case 'notification':
         return 'bg-purple-500/20 text-purple-400';
      case 'submission':
         return 'bg-orange-500/20 text-orange-400';
      case 'appeal':
         return 'bg-error/20 text-error';
      case 'cloud-function':
         return 'bg-purple-500/20 text-purple-400';
      default:
         return 'bg-accent-500 text-accent-300';
   }
});

const handleClick = () => {
   emit('click', props.result);
};
</script>

<template>
   <div
      class="group px-4 py-2.5 hover:bg-accent-600 transition-colors cursor-pointer rounded-lg border-transparent"
      :class="{ 'bg-accent-500': isSelected }"
      @click="handleClick">
      <StSpace gap="0.75rem" align="center" fill-x>
         <!-- 图标 -->
         <div
            :class="typeBgColor"
            class="size-[2.5rem] flex items-center justify-center rounded-full shrink-0">
            <component :is="icon" class="text-md shrink-0" :class="typeColor" />
         </div>

         <!-- 内容区域 -->
         <StSpace direction="vertical" gap="0.25rem" fill-x class="min-w-0">
            <!-- 标题行 -->
            <StSpace gap="0.5rem" align="center" fill-x no-wrap>
               <!-- 标题（命中关键词高亮） -->
               <h3 class="text-white text-sm font-medium truncate flex-1">
                  <template
                     v-for="(segment, index) in titleSegments"
                     :key="index">
                     <mark
                        v-if="segment.hit"
                        class="bg-primary/25 text-primary rounded-sm px-0.5 font-medium">
                        {{ segment.text }}
                     </mark>
                     <template v-else>{{ segment.text }}</template>
                  </template>
               </h3>

               <!-- 标签组 -->
               <StSpace gap="0.25rem" align="center" no-wrap class="shrink-0">
                  <!-- 类型标签 -->
                  <span
                     class="text-[0.625rem] px-2 py-1 rounded bg-accent-500 text-accent-200 leading-none whitespace-nowrap">
                     {{ typeText }}
                  </span>

                  <!-- 难度标签 -->
                  <span
                     v-if="
                        result.type === 'problem' ||
                        result.type === 'daily-problem'
                     "
                     class="text-[0.625rem] px-1.5 py-1 rounded leading-none whitespace-nowrap"
                     :class="difficultyColor(result.metadata.difficulty)">
                     {{ difficultyText(result.metadata.difficulty) }}
                  </span>

                  <!-- 今日标记 -->
                  <StSpace
                     v-if="
                        result.type === 'daily-problem' &&
                        result.metadata.isToday
                     "
                     gap="0.25rem"
                     align="center"
                     class="text-[0.625rem] px-1.5 py-1 rounded bg-primary/20 text-primary leading-none whitespace-nowrap">
                     <Fire theme="filled" size="10" />
                     <span>今日</span>
                  </StSpace>
               </StSpace>
            </StSpace>

            <!-- 元数据行 -->
            <StSpace
               gap="0.75rem"
               align="center"
               class="text-xs text-accent-300">
               <!-- 题目元数据 -->
               <template v-if="result.type === 'problem'">
                  <StSpace
                     v-if="result.metadata.solvedCount"
                     gap="0.25rem"
                     align="center"
                     no-wrap>
                     <Check size="12" class="text-success" />
                     <span>{{ result.metadata.solvedCount }}</span>
                  </StSpace>
                  <StSpace
                     v-if="result.metadata.acceptRate"
                     gap="0.25rem"
                     align="center"
                     no-wrap>
                     <ChartProportion size="12" />
                     <span>
                        {{ (result.metadata.acceptRate * 100).toFixed(0) }}%
                     </span>
                  </StSpace>
                  <StSpace
                     v-if="result.metadata.tags.length > 0"
                     gap="0.25rem"
                     no-wrap>
                     <span
                        v-for="tag in result.metadata.tags.slice(0, 2)"
                        :key="tag"
                        class="text-accent-400 whitespace-nowrap">
                        #{{ tag }}
                     </span>
                  </StSpace>
               </template>

               <!-- 用户元数据 -->
               <template v-else-if="result.type === 'user'">
                  <span>{{ result.metadata.role }}</span>
                  <StSpace
                     v-if="result.metadata.solvedProblems"
                     gap="0.25rem"
                     align="center"
                     no-wrap>
                     <Check size="12" class="text-success" />
                     <span>{{ result.metadata.solvedProblems }} 题</span>
                  </StSpace>
               </template>

               <!-- 标签元数据 -->
               <template v-else-if="result.type === 'tag'">
                  <span>{{ result.metadata.problemCount }} 道题目</span>
               </template>

               <!-- 页面板块元数据 -->
               <template v-else-if="result.type === 'page-section'">
                  <span>{{ result.metadata.pageName }}</span>
               </template>

               <!-- 每日一题元数据 -->
               <template v-else-if="result.type === 'daily-problem'">
                  <StSpace gap="0.25rem" align="center" no-wrap>
                     <Time size="12" />
                     <span>{{
                        new Date(result.metadata.date).toLocaleDateString(
                           'zh-CN',
                           { month: 'long', day: 'numeric' }
                        )
                     }}</span>
                  </StSpace>
                  <StSpace
                     v-if="result.metadata.tags.length > 0"
                     gap="0.25rem"
                     no-wrap>
                     <span
                        v-for="tag in result.metadata.tags.slice(0, 2)"
                        :key="tag"
                        class="text-accent-400 whitespace-nowrap">
                        #{{ tag }}
                     </span>
                  </StSpace>
               </template>

               <!-- 成就元数据 -->
               <template v-else-if="result.type === 'achievement'">
                  <span>{{ result.metadata.score }} 分</span>
                  <span
                     v-if="result.metadata.unlocked"
                     class="text-success flex items-center gap-1">
                     <Check size="12" />
                     已解锁
                  </span>
               </template>

               <!-- 通知元数据 -->
               <template v-else-if="result.type === 'notification'">
                  <span>{{
                     new Date(result.metadata.createdAt).toLocaleDateString(
                        'zh-CN',
                        { month: 'long', day: 'numeric' }
                     )
                  }}</span>
                  <span v-if="!result.metadata.read" class="text-warning">
                     未读
                  </span>
               </template>

               <!-- 提交记录元数据（管理员） -->
               <template v-else-if="result.type === 'submission'">
                  <span
                     :class="
                        result.metadata.result === 'success'
                           ? 'text-success'
                           : result.metadata.result === 'failed'
                             ? 'text-error'
                             : 'text-accent-300'
                     ">
                     {{ result.metadata.score }} 分
                  </span>
                  <StSpace gap="0.25rem" align="center" no-wrap>
                     <Check size="12" class="text-success" />
                     <span>@{{ result.metadata.userName }}</span>
                  </StSpace>
               </template>

               <!-- 申诉元数据（管理员） -->
               <template v-else-if="result.type === 'appeal'">
                  <span
                     :class="
                        result.metadata.status === 'PENDING'
                           ? 'text-warning'
                           : 'text-accent-300'
                     ">
                     {{ appealStatusText(result.metadata.status) }}
                  </span>
                  <span>@{{ result.metadata.userName }}</span>
               </template>

               <!-- 云函数元数据（管理员） -->
               <template v-else-if="result.type === 'cloud-function'">
                  <span
                     :class="
                        result.metadata.enabled ? 'text-success' : 'text-error'
                     ">
                     {{ result.metadata.enabled ? '已启用' : '已停用' }}
                  </span>
               </template>
            </StSpace>
         </StSpace>
      </StSpace>
   </div>
</template>

<style scoped>
.line-clamp-2 {
   display: -webkit-box;
   -webkit-line-clamp: 2;
   line-clamp: 2;
   -webkit-box-orient: vertical;
   overflow: hidden;
}
</style>
