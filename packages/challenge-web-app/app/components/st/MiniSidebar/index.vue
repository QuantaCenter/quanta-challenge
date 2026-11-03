<script setup lang="ts">
import { computed, provide } from 'vue';
import { MINI_SIDEBAR_TOOLTIP_HIDDEN_KEY } from './type';

const props = defineProps<{
   hideTooltips?: boolean;
   hideHeader?: boolean;
   /** 紧凑模式：按钮与留白整体缩小（嵌入做题页使用） */
   compact?: boolean;
}>();

provide(
   MINI_SIDEBAR_TOOLTIP_HIDDEN_KEY,
   computed(() => props.hideTooltips ?? false),
);
</script>

<template>
   <!-- 子按钮统一读 --mini-sidebar-item / --mini-sidebar-gap，紧凑模式只需改这两个变量 -->
   <aside
      class="h-full flex flex-col items-center shrink-0 bg-[#1F1F1F] z-[1000]"
      :class="
         compact
            ? 'p-1 rounded-lg [--mini-sidebar-item:2.125rem] [--mini-sidebar-gap:0.5rem]'
            : 'py-2 px-2 rounded-xl'
      ">
      <slot v-if="!hideHeader" name="header">
         <StSpace
            align="center"
            justify="center"
            class="size-[var(--mini-sidebar-item,2.75rem)] bg-[#272727] rounded-lg">
            <IconLogo :class="compact ? 'scale-[0.46]' : 'scale-[0.6]'" class="origin-center" />
         </StSpace>
      </slot>
      <slot></slot>
   </aside>
</template>
