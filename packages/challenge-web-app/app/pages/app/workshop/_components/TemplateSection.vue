<script setup lang="ts">
import type { DefineComponent } from 'vue';
import { Ghost, ThreeHexagons } from '@icon-park/vue-next';
import { watchDebounced } from '@vueuse/core';
import type { WorkshopTemplateItem } from '~/composables/use-workshop-projects';
import { useViewTransition } from '~/composables/use-view-transition';
import { useIsMobile } from '~/composables/use-is-mobile';
import {
   workshopCategoryIcon,
   resolveWorkshopCategory,
   type WorkshopCategoryDisplay,
} from '~/utils/workshop-category-icons';
import ProblemSearchInput from '../../problems/_components/ProblemSearchInput.vue';
import ScrollMaskRow from './ScrollMaskRow.vue';
import TemplateCard from './TemplateCard.vue';

/** 「从模板创建」区块：分类筛选、关键字搜索、模板卡片网格 */

const props = defineProps<{
   templates: WorkshopTemplateItem[];
   /** 全部模板分类（已按排序），含已停用的 */
   categories: WorkshopCategoryDisplay[];
   pending: boolean;
   error: boolean;
}>();

defineEmits<{ select: [template: WorkshopTemplateItem]; retry: [] }>();

/** 分类页签：只展示启用、且至少有一个模板的分类 */
const categoryTabs = computed(() =>
   props.categories.filter(
      (category) =>
         category.enabled !== false &&
         props.templates.some((item) => item.category === category.id),
   ),
);
const selectedCategory = ref<string | null>(null);
const { startViewTransition } = useViewTransition();
const isMobile = useIsMobile();
const updateResults = (update: () => void) => {
   if (isMobile.value) {
      update();
   } else {
      startViewTransition(update);
   }
};
const selectCategory = (category: string | null) => {
   if (selectedCategory.value === category) return;
   updateResults(() => {
      selectedCategory.value = category;
   });
};
// 选中的分类被停用或不再有模板时回到「全部」
watch(categoryTabs, (tabs) => {
   if (selectedCategory.value && !tabs.some((tab) => tab.id === selectedCategory.value)) {
      selectedCategory.value = null;
   }
});
const keyword = ref('');
const searchQuery = ref('');
watchDebounced(
   keyword,
   (value) => {
      const query = value.trim().toLowerCase();
      if (query === searchQuery.value) return;
      updateResults(() => {
         searchQuery.value = query;
      });
   },
   { debounce: 300 },
);

const visibleTemplates = computed(() => {
   const query = searchQuery.value;
   return props.templates.filter((item) => {
      if (selectedCategory.value && item.category !== selectedCategory.value) {
         return false;
      }
      if (!query) return true;
      return [item.name, item.description, ...item.tags].some((text) =>
         text.toLowerCase().includes(query),
      );
   });
});
</script>

<template>
   <StSpace fill-x direction="vertical" gap="1rem">
      <StSpace fill-x align="center" justify="between" gap="0.75rem">
         <h2 class="text-xl font-bold max-md:text-base">从模板创建</h2>
         <slot name="header-actions" />
      </StSpace>
      <StSpace
         fill-x
         gap="1rem"
         class="h-[3.5rem] max-md:h-auto max-md:flex-col">
         <ScrollMaskRow class="flex-1 max-md:flex-none max-md:w-full">
            <StSpace gap="0.75rem" no-wrap class="w-max">
               <StTagButton
                  :icon="ThreeHexagons as DefineComponent"
                  :tag="{ name: '全部' }"
                  :selected="selectedCategory === null"
                  @click="selectCategory(null)" />
               <StTagButton
                  v-for="category in categoryTabs"
                  :key="category.id"
                  :icon="workshopCategoryIcon(category.icon)"
                  :tag="{ name: category.name, color: category.color }"
                  :selected="selectedCategory === category.id"
                  contrast-text
                  @click="selectCategory(category.id)" />
            </StSpace>
         </ScrollMaskRow>
         <div class="flex shrink-0 max-md:w-full">
            <ProblemSearchInput
               v-model:value="keyword"
               placeholder="搜索模板或技术栈..." />
         </div>
      </StSpace>

      <div
         v-if="pending"
         class="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 max-md:gap-3">
         <StSkeletonItem
            v-for="i in 4"
            :key="i"
            class="h-[7.5rem] w-full"
            rounded="lg" />
      </div>
      <StSpace
         v-else-if="error"
         direction="vertical"
         align="center"
         gap="1rem"
         class="w-full py-10 text-accent-300">
         <span>模板加载失败，请重试。</span>
         <StButton bordered size="sm" @click="$emit('retry')">重试</StButton>
      </StSpace>
      <StEmptyStatus
         v-else-if="!visibleTemplates.length"
         content="没有匹配的模板"
         class="!w-full pb-16 mt-[3rem]" />
      <div
         v-else
         class="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 max-md:gap-3">
         <TemplateCard
            v-for="item in visibleTemplates"
            :key="item.id"
            :style="{ viewTransitionName: `workshop-template-${item.id}` }"
            :template="item"
            :category="resolveWorkshopCategory(categories, item.category)"
            @select="$emit('select', item)" />
      </div>

      <div
         v-if="!pending && !error && visibleTemplates.length"
         class="shrink-0 w-full h-[3.5rem] flex items-center justify-center text-sm text-accent-400">
         <StSpace align="center" gap="0.4em">
            <Ghost theme="outline" size="1rem" />
            更多模板敬请期待～
         </StSpace>
      </div>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
