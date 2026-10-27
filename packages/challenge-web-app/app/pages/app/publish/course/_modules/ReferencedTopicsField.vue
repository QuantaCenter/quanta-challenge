<script setup lang="ts">
import { BookOne, Delete, Drag, Edit, Plus } from '@icon-park/vue-next';
import {
   articlesOfTopic,
   useLearningCourse,
   useLearningTopic,
   useAllTopics,
} from '~/composables/use-learning';
import type { PendingTopic } from './TopicEditingDrawer.vue';
import { useDragSort } from '../_composables/use-drag-sort';

/**
 * 「编排专题」字段：课程**集合**专题，专题**引用**文章。
 * 已有专题交给共用的 `LearningContentPicker`（右侧抽屉，专题库搜索；
 * 挂在课程表单页上，是一级抽屉），
 * 新建 / 编辑交给 `TopicEditingDrawer`，本组件只负责列表展示与排序。
 */
const picked = defineModel<number[]>('value', { default: () => [] });
/** 课程还没保存时，新建的专题先留在这里，随课程一起提交 */
const pending = defineModel<PendingTopic[]>('pending', {
   default: () => [],
});

const emit = defineEmits<{
   create: [];
   editExisting: [id: number];
   editPending: [index: number];
}>();

const content = useLearningContentStore();
const allTopics = useAllTopics(content);
const pickerOpened = ref(false);

const rows = computed(() =>
   picked.value.map((id) => {
      const topic =
         allTopics.find((item) => item.id === id) ?? useLearningTopic(id);
      return {
         id,
         name: topic?.name ?? `未知专题 #${id}`,
         description: topic?.description ?? '',
         articleCount: topic ? articlesOfTopic(topic, content).length : 0,
         courseName: topic
            ? (useLearningCourse(topic.courseId, content)?.name ?? '')
            : '',
      };
   }),
);

const {
   draggingIndex,
   onDragStart,
   onDragOver,
   onDrop,
   onDragEnd,
   // 拖过即换位：配合下方 TransitionGroup，其余行实时平滑让位
} = useDragSort(picked, { liveReorder: true });
</script>

<template>
   <StSpace direction="vertical" gap="0.75rem" fill-x>
      <!-- 课程未保存时的待创建专题：先挂在本地，随课程一起落库 -->
      <div
         v-for="(draft, index) in pending"
         :key="`pending-${index}`"
         class="w-full p-4 rounded-[0.5rem] border border-dashed border-secondary/50 bg-accent-600/40 flex items-center gap-3">
         <StSpace direction="vertical" gap="0.25rem" class="min-w-0 flex-1">
            <span class="st-font-body-bold text-accent-100 truncate">
               {{ draft.name }}
            </span>
            <StSpace align="center" gap="0.5rem">
               <span class="st-font-tooltip text-accent-400 font-family-manrope">
                  {{ draft.articleIds.length }} 篇文章
               </span>
               <span class="st-font-tooltip text-secondary">保存课程时创建</span>
            </StSpace>
         </StSpace>

         <button
            type="button"
            title="编辑"
            aria-label="编辑"
            class="shrink-0 flex items-center justify-center cursor-pointer text-accent-300 transition-opacity hover:opacity-70"
            @click="emit('editPending', index)">
            <Edit size="1rem" :strokeWidth="3" />
         </button>
         <button
            type="button"
            title="移除"
            aria-label="移除"
            class="shrink-0 flex items-center justify-center cursor-pointer text-accent-300 transition-colors hover:text-[#fa2f32]"
            @click="pending = pending.filter((item) => item.key !== draft.key)">
            <Delete size="1rem" :strokeWidth="3" />
         </button>
      </div>

      <!-- TransitionGroup 让拖拽排序落位时有平滑的位移动画 -->
      <TransitionGroup name="picker-row">
         <div
            v-for="(row, index) in rows"
            :key="row.id"
            draggable="true"
            class="w-full p-4 rounded-[0.5rem] border border-accent-300 bg-accent-600/40 flex items-center gap-3"
            :class="draggingIndex === index ? 'opacity-40' : ''"
            @dragstart="onDragStart(index, $event)"
            @dragover="onDragOver(index, $event)"
            @drop="onDrop(index, $event)"
            @dragend="onDragEnd">
            <Drag
               class="shrink-0 text-accent-300 cursor-grab active:cursor-grabbing"
               size="1rem"
               :strokeWidth="3" />

            <StSpace direction="vertical" gap="0.25rem" class="min-w-0 flex-1">
               <span class="st-font-body-bold text-accent-100 truncate">
                  {{ row.name }}
               </span>
               <StSpace align="center" gap="0.5rem">
                  <span class="st-font-tooltip text-accent-400 font-family-manrope">
                     {{ row.articleCount }} 篇文章
                  </span>
                  <span v-if="row.courseName" class="st-font-tooltip text-accent-400">
                     现属于 {{ row.courseName }}
                  </span>
               </StSpace>
            </StSpace>

            <button
               type="button"
               title="编辑"
               aria-label="编辑"
               class="shrink-0 flex items-center justify-center cursor-pointer text-accent-300 transition-opacity hover:opacity-70"
               @click="emit('editExisting', row.id)">
               <Edit size="1rem" :strokeWidth="3" />
            </button>
            <button
               type="button"
               title="移除"
               aria-label="移除"
               class="shrink-0 flex items-center justify-center cursor-pointer text-accent-300 transition-colors hover:text-[#fa2f32]"
               @click="picked = picked.filter((id) => id !== row.id)">
               <Delete size="1rem" :strokeWidth="3" />
            </button>
         </div>
      </TransitionGroup>

      <StEmptyStatus
         v-if="rows.length === 0 && pending.length === 0"
         content="还没有编排专题；课程至少要包含 1 个专题才能送审"
         class="w-full py-8 rounded-[0.5rem] border border-dashed border-accent-300" />

      <StSpace gap="0.75rem" fill-x>
         <StButton size="sm" bordered class="flex-1" @click="pickerOpened = true">
            <StSpace align="center" gap="0.375rem">
               <Plus size="1rem" />
               <span>从专题库选择</span>
            </StSpace>
         </StButton>
         <StButton size="sm" bordered class="flex-1" @click="emit('create')">
            <StSpace align="center" gap="0.375rem">
               <BookOne size="1rem" />
               <span>新建专题</span>
            </StSpace>
         </StButton>
      </StSpace>

      <LearningContentPicker
         v-model:opened="pickerOpened"
         kind="topic"
         multiple
         :selected-ids="picked"
         @confirm="picked = $event" />
   </StSpace>
</template>

<style scoped>
/* 拖拽排序落位：其余行平滑滑动到新位置 */
.picker-row-move {
   transition: transform 0.25s ease;
}
</style>
