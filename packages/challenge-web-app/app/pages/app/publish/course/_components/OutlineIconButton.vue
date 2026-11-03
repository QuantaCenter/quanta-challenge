<script setup lang="ts">
import type { Component } from 'vue';

/** 大纲行内的小图标按钮，与标签管理等页面的操作按钮保持同一风格。 */
defineProps<{
   icon: Component;
   label: string;
   danger?: boolean;
   disabled?: boolean;
}>();

defineEmits<{ click: [] }>();
</script>

<template>
   <button
      type="button"
      :title="label"
      :aria-label="label"
      :disabled="disabled"
      class="flex items-center justify-center size-8 shrink-0 rounded-md text-accent-300 transition-all cursor-pointer active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100"
      :class="
         danger
            ? 'hover:enabled:bg-error/15 hover:enabled:text-error'
            : 'hover:enabled:bg-accent-500 hover:enabled:text-secondary'
      "
      @click.stop="$emit('click')">
      <Component :is="icon" class="text-[1.125rem]" />
   </button>
</template>
