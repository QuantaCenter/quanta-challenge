<script setup lang="ts">
import type { DefineComponent } from 'vue';
import {
   ChartHistogram,
   CodeBrackets,
   Components,
   Ghost,
   Server,
   ThreeHexagons,
} from '@icon-park/vue-next';
import {
   LAB_CATEGORY_COLOR,
   LAB_CATEGORY_LABEL,
   LAB_CATEGORY_ORDER,
   LAB_TEMPLATES,
   type LabTemplate,
   type LabTemplateCategory,
} from '@challenge/shared/lab-templates';
import ProblemSearchInput from '../../problems/_components/ProblemSearchInput.vue';
import ScrollMaskRow from './ScrollMaskRow.vue';
import TemplateCard from './TemplateCard.vue';

/** 「从模板创建」区块：分类筛选、关键字搜索、模板卡片网格 */

defineEmits<{ select: [template: LabTemplate] }>();

const CATEGORY_ICON: Record<LabTemplateCategory, DefineComponent> = {
   framework: Components as DefineComponent,
   chart: ChartHistogram as DefineComponent,
   basic: CodeBrackets as DefineComponent,
   backend: Server as DefineComponent,
};

const categories = LAB_CATEGORY_ORDER.filter((category) =>
   LAB_TEMPLATES.some((item) => item.category === category),
);
const selectedCategory = ref<LabTemplateCategory | null>(null);
const keyword = ref('');

const visibleTemplates = computed(() => {
   const query = keyword.value.trim().toLowerCase();
   return LAB_TEMPLATES.filter((item) => {
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
      <h2 class="text-xl font-bold max-md:text-base">从模板创建</h2>
      <StSpace
         fill-x
         gap="1rem"
         class="h-[3.5rem] max-md:h-auto max-md:flex-col">
         <ScrollMaskRow class="flex-1 max-md:flex-none max-md:w-full">
            <StSpace gap="0.75rem" no-wrap class="w-max">
               <StTagButton
                  :icon="ThreeHexagons"
                  :tag="{ name: '全部' }"
                  :selected="selectedCategory === null"
                  @click="selectedCategory = null" />
               <StTagButton
                  v-for="category in categories"
                  :key="category"
                  :icon="CATEGORY_ICON[category]"
                  :tag="{
                     name: LAB_CATEGORY_LABEL[category],
                     color: LAB_CATEGORY_COLOR[category],
                  }"
                  :selected="selectedCategory === category"
                  @click="selectedCategory = category" />
            </StSpace>
         </ScrollMaskRow>
         <div class="flex shrink-0 max-md:w-full">
            <ProblemSearchInput
               v-model:value="keyword"
               placeholder="搜索模板或技术栈..." />
         </div>
      </StSpace>

      <StEmptyStatus
         v-if="!visibleTemplates.length"
         content="没有匹配的模板"
         class="!w-full pb-16 mt-[3rem]" />
      <div
         v-else
         class="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 max-md:gap-3">
         <TemplateCard
            v-for="item in visibleTemplates"
            :key="item.id"
            :template="item"
            @select="$emit('select', item)" />
      </div>

      <div
         v-if="visibleTemplates.length"
         class="shrink-0 w-full h-[3.5rem] flex items-center justify-center text-sm text-accent-400">
         <StSpace align="center" gap="0.4em">
            <Ghost theme="outline" size="1rem" />
            更多模板敬请期待～
         </StSpace>
      </div>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
