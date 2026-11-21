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
   /** 让带单位的数值在卡片中使用紧凑字号并保持单行。 */
   compactValue?: boolean;
}

defineProps<{
   items: ICloudFunctionStat[];
   /** 数值使用数字专用字体（Manrope）并等宽对齐 */
   numericFont?: boolean;
}>();
</script>

<template>
   <StSpace gap="1rem" class="w-full max-md:flex-wrap!">
      <div
         v-for="item in items"
         :key="item.label"
         class="flex-1 rounded-2xl bg-accent-600 px-5 py-4 max-md:min-w-[calc(50%-0.5rem)]">
         <div class="st-font-caption tracking-wider text-accent-300">
            {{ item.label }}
         </div>
         <div
            class="st-font-secondary-bold mt-1"
            :class="[item.color, {
               'font-family-manrope tabular-nums': numericFont,
               'truncate text-xl leading-12 max-md:text-sm': item.compactValue,
            }]"
            :title="item.compactValue ? String(item.value) : undefined">
            {{ item.value }}
         </div>
      </div>
   </StSpace>
</template>
