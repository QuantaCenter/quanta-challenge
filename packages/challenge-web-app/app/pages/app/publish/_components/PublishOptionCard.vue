<script setup lang="ts">
import type { DefineComponent } from 'vue';

/** 发布流程页的入口卡片。compact 用于展开后的子项（创建专题 / 创建课程）。 */
withDefaults(
   defineProps<{
      title: string;
      description: string;
      url: string;
      icon: DefineComponent;
      iconColor: string;
      compact?: boolean;
   }>(),
   { compact: false },
);
</script>

<template>
   <NuxtLink :to="url" class="block w-full">
      <StSpace
         fill-x
         justify="between"
         align="center"
         class="border border-accent-300 rounded-xl group overflow-hidden relative hover:border-secondary/70 transition-colors cursor-pointer"
         :class="compact ? '!p-4' : 'p-6'">
         <StSpace direction="vertical" gap="0.5rem" class="min-w-0">
            <h2
               class="st-font-capture text-white"
               :class="compact ? 'text-[1rem]' : 'text-[1.25rem]'">
               {{ title }}
            </h2>
            <p
               class="text-accent-300"
               :class="compact ? 'st-font-tooltip' : 'st-font-body-normal'">
               {{ description }}
            </p>
         </StSpace>
         <Component
            :is="icon"
            :fill="iconColor"
            :strokeWidth="3"
            :size="compact ? '4.5rem' : '7rem'"
            class="absolute -right-5 -bottom-6 rotate-12 opacity-50 group-hover:opacity-90 group-hover:scale-125 transition-all duration-300" />
      </StSpace>
   </NuxtLink>
</template>
