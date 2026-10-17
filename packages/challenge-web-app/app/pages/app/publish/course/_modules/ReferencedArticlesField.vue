<script setup lang="ts">
import { DocDetail, Drag, Plus } from '@icon-park/vue-next';
import { topicsOfArticle, useLearningArticles } from '~/composables/use-learning';
import { useFavorites } from '~/composables/use-favorites';

/**
 * 「引用文章」字段：专题**引用**文章，不是拥有文章。
 * 选择动作交给共用的 `LearningContentPicker`（浮窗，文章库搜索 + 从收藏里挑），
 * 列表顺序就是专题页里的文章顺序，所以这里可以拖动排序。
 */
const picked = defineModel<number[]>('value', { default: () => [] });

const content = useLearningContentStore();
const articles = useLearningArticles(content);
const favorites = useFavorites();
const pickerOpened = ref(false);

const rows = computed(() =>
   picked.value.map((id) => {
      const article = articles.find((item) => item.id === id);
      if (article) {
         return {
            id,
            title: article.title,
            summary: article.summary,
            problemCount: article.problems.length,
            referencedBy: topicsOfArticle(id, content).map((topic) => topic.name),
         };
      }

      const favorite = favorites.articleFavorites.value.find(
         (item) => item.articleId === id,
      );
      return {
         id,
         title: favorite?.title ?? `未知文章 #${id}`,
         summary: favorite?.summary ?? '',
         problemCount: 0,
         referencedBy: [],
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
         <DocDetail
            class="shrink-0 text-accent-200"
            size="1rem"
            :strokeWidth="3" />

         <StSpace direction="vertical" gap="0.25rem" class="min-w-0 flex-1">
            <span class="st-font-body-bold text-accent-100 truncate">
               {{ row.title }}
            </span>
            <StSpace align="center" gap="0.5rem">
               <span class="st-font-tooltip text-accent-400 font-family-manrope">
                  {{ row.problemCount }} 题
               </span>
               <span v-if="row.referencedBy.length" class="st-font-tooltip text-accent-400">
                  已被 {{ row.referencedBy.join(' · ') }} 引用
               </span>
               <span v-else class="st-font-tooltip text-accent-400">
                  还没有专题引用它
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
         还没有引用文章；专题至少要引用 1 篇才能送审
      </StSpace>

      <StButton size="sm" bordered @click="pickerOpened = true">
         <StSpace align="center" gap="0.375rem">
            <Plus size="1rem" />
            <span>从文章库 / 收藏选择</span>
         </StSpace>
      </StButton>

      <LearningContentPicker
         v-model:opened="pickerOpened"
         kind="article"
         multiple
         :selected-ids="picked"
         @confirm="picked = $event" />
   </StSpace>
</template>
