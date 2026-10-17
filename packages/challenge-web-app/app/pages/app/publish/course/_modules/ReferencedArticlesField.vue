<script setup lang="ts">
import { Delete, Drag, Plus } from '@icon-park/vue-next';
import { topicsOfArticle, useLearningArticles } from '~/composables/use-learning';
import { useFavorites } from '~/composables/use-favorites';

/**
 * 「引用文章」字段：专题**引用**文章，不是拥有文章。
 * 选择动作交给共用的 `LearningContentPicker`（右侧抽屉，文章库搜索 + 从收藏里挑），
 * 列表顺序就是专题页里的文章顺序，所以这里可以拖动排序。
 * 本组件只会在 `TopicEditingDrawer`（一级抽屉）里出现，
 * 因此文章选择抽屉是**二级抽屉**：宽度更窄，打开时一级抽屉保持打开、
 * 在左侧露出一条，二级关闭后回到一级。
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
   onDragStart,
   onDragOver,
   onDrop,
   onDragEnd,
   // 拖过即换位：配合下方 TransitionGroup，其余行实时平滑让位
} = useDragSort(picked, { liveReorder: true });
</script>

<template>
   <StSpace direction="vertical" gap="0.75rem" fill-x>
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
         v-if="rows.length === 0"
         content="还没有引用文章；专题至少要引用 1 篇才能送审"
         class="w-full py-8 rounded-[0.5rem] border border-dashed border-accent-300" />

      <StButton size="sm" bordered class="w-full" @click="pickerOpened = true">
         <StSpace align="center" justify="center" gap="0.375rem" class="w-full">
            <Plus size="1rem" />
            <span>从文章库选择</span>
         </StSpace>
      </StButton>

      <!-- 二级抽屉：与一级抽屉（52.5rem）保持 4:7 比例，打开时露出下层专题抽屉 -->
      <LearningContentPicker
         v-model:opened="pickerOpened"
         kind="article"
         multiple
         width="45rem"
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
