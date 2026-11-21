<script setup lang="ts">
defineProps<{ label: string; value: string; buttonClass?: string }>();
const emit = defineEmits<{ copy: [value: string, label: string] }>();
</script>

<template>
   <StPopover content="点击以复制" placement="top" :z-index="10001" tooltip>
      <button
         type="button"
         class="w-full min-w-0 rounded transition-colors hover:cursor-pointer hover:bg-white/15 active:bg-white/20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
         :class="buttonClass"
         :aria-label="`复制${label} ${value}`"
         @click="emit('copy', value, label)">
         <slot>{{ value }}</slot>
      </button>
   </StPopover>
</template>
