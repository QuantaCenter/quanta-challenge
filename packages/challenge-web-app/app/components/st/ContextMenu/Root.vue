<script setup lang="ts">
import type { ContextMenuProvideValue } from './type';

const props = defineProps<{
   contextKey?: string | symbol;
}>();

const { position, status, targetElement } = inject<ContextMenuProvideValue>(
   props.contextKey ?? '__clickMenu'
)!;
</script>

<template>
   <div
      class="left-0 top-0 absolute z-[10000]"
      :style="{
         top: status === 'opened' ? 0 : '-.5rem',
         transform: `translate(${position.x}px, ${position.y}px)`,
         opacity: status === 'opened' ? 1 : 0,
         pointerEvents: status === 'opened' ? 'auto' : 'none',
         transition: 'top 0.1s ease, opacity 0.1s ease',
      }">
      <slot :target="targetElement"></slot>
   </div>
</template>
