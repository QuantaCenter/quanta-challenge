<script setup lang="ts">
import { BookOne, Drag, Plus } from '@icon-park/vue-next';
import {
   articlesOfTopic,
   useLearningCourse,
   useLearningTopic,
   useAllTopics,
} from '~/composables/use-learning';

/**
 * 「编排专题」字段：课程**集合**专题，专题**引用**文章。
 * 选择动作交给共用的 `LearningContentPicker`（浮窗，专题库搜索），
 * 列表顺序就是课程页里专题栏的顺序，所以这里可以拖动排序。
 */
const picked = defineModel<number[]>('value', { default: () => [] });

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
   overIndex,
   onDragStart,
   onDragOver,
   onDrop,
   onDragEnd,
} = useDragSort(picked);
</script>

<template>
   <StSpace direction="vertical" gap="0.75rem" fill-x>
      <div
         v-for="(row, index) in rows"
         :key="row.id"
         draggable="true"
         class="w-full p-4 rounded-[0.5rem] border bg-accent-600/40 flex items-center gap-3 transition-colors"
         :class="[
            draggingIndex === index ? 'opacity-40' : '',
            overIndex === index &&
            draggingIndex !== null &&
            draggingIndex !== index
               ? 'border-secondary'
               : 'border-accent-300',
         ]"
         @dragstart="onDragStart(index, $event)"
         @dragover="onDragOver(index, $event)"
         @drop="onDrop(index, $event)"
         @dragend="onDragEnd">
         <Drag
            class="shrink-0 text-accent-300 cursor-grab active:cursor-grabbing"
            size="1rem"
            :strokeWidth="3" />
         <BookOne
            class="shrink-0 text-accent-200"
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

         <StButton
            size="sm"
            bordered
            class="shrink-0"
            @click="picked = picked.filter((id) => id !== row.id)">
            <span>移除</span>
         </StButton>
      </div>

      <StSpace
         v-if="rows.length === 0"
         align="center"
         fill-x
         class="p-4 rounded-[0.5rem] border border-dashed border-accent-400 st-font-tooltip text-accent-400">
         还没有编排专题；课程至少要包含 1 个专题才能送审
      </StSpace>

      <StButton size="sm" bordered @click="pickerOpened = true">
         <StSpace align="center" gap="0.375rem">
            <Plus size="1rem" />
            <span>从专题库选择</span>
         </StSpace>
      </StButton>

      <LearningContentPicker
         v-model:opened="pickerOpened"
         kind="topic"
         multiple
         :selected-ids="picked"
         @confirm="picked = $event" />
   </StSpace>
</template>
