<script setup lang="ts">
/**
 * 云函数相关页面的统计卡片行。
 *
 * 管理页（4 项，含 API Key）与发布页（3 项）都用它，避免两处重复同一段卡片布局。
 */
export interface ICloudFunctionStat {
   label: string;
   value: number | string;
   /** Tailwind 文本色类名，如 `text-success` */
   color?: string;
}

defineProps<{
   items: ICloudFunctionStat[];
}>();
</script>

<template>
   <StSpace gap="1rem" class="w-full">
      <div
         v-for="item in items"
         :key="item.label"
         class="flex-1 rounded-2xl bg-accent-600 px-5 py-4">
         <div class="st-font-caption tracking-wider text-accent-300">
            {{ item.label }}
         </div>
         <div class="st-font-secondary-bold mt-1" :class="item.color">
            {{ item.value }}
         </div>
      </div>
   </StSpace>
</template>
