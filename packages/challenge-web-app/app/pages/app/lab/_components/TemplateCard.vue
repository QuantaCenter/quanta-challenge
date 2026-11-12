<script setup lang="ts">
import {
   LAB_CATEGORY_COLOR,
   LAB_CATEGORY_LABEL,
   type LabTemplate,
} from '@challenge/shared/lab-templates';
import TechTagIcon from './TechTagIcon.vue';

/** 模板卡片：点击触发 select，由页面打开详情弹窗 */

defineProps<{ template: LabTemplate }>();

defineEmits<{ select: [] }>();
</script>

<template>
   <button
      type="button"
      class="h-full rounded-xl text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-secondary"
      :aria-label="`查看 ${template.name} 模板`"
      @click="$emit('select')">
      <StCard
         class="h-full !rounded-xl !p-3 transition-all hover:ring-secondary/50 active:scale-[0.99] md:active:scale-100">
         <template #header>
            <span class="sr-only">{{ template.name }}</span>
         </template>
         <StSpace fill-x direction="vertical" gap="0.75rem" class="min-w-0 flex-1">
            <!-- 上：图标 + 名称 / 分类 -->
            <StSpace fill-x align="center" gap="0.75rem" class="min-w-0">
               <img
                  :src="template.icon"
                  :alt="template.name"
                  class="size-7 shrink-0 object-contain"
                  draggable="false" />
               <h3 class="min-w-0 flex-1 line-clamp-1 text-base leading-6 font-bold">
                  {{ template.name }}
               </h3>
               <StTag
                  size="small"
                  :color="LAB_CATEGORY_COLOR[template.category]"
                  :content="LAB_CATEGORY_LABEL[template.category]"
                  class="shrink-0" />
            </StSpace>
            <!-- 下：简介 + 技术栈 -->
            <StSpace fill-x direction="vertical" gap="0.5rem" class="min-w-0">
               <p
                  class="st-font-caption h-10 w-full shrink-0 line-clamp-2 break-words leading-5 text-accent-300">
                  {{ template.description }}
               </p>
               <StSpace fill-x align="center" gap="0.5rem" wrap>
                  <span
                     v-for="tagName in template.tags"
                     :key="tagName"
                     class="inline-flex h-6 items-center gap-1.5 rounded-md bg-accent-500/60 px-2 text-xs font-medium leading-4 text-accent-200">
                     <TechTagIcon :name="tagName" />
                     <span class="whitespace-nowrap">{{ tagName }}</span>
                  </span>
               </StSpace>
            </StSpace>
         </StSpace>
      </StCard>
   </button>
</template>
