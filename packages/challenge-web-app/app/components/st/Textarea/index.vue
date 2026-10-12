<script setup lang="ts">
import type { FormItemStatus } from '../Form/type';

const props = defineProps<{
   outerClass?: string;
   status?: FormItemStatus;
   disabled?: boolean;
}>();

const value = defineModel<string>('value');
const borderClass = computed(() => {
   return props.status === 'error'
      ? '!border !border-error'
      : props.status === 'success'
      ? '!border !border-success'
      : '';
});
</script>

<template>
   <div
      class="text-accent-300 flex items-center gap-3 py-4 px-6 rounded-lg caret-primary selection:bg-secondary/60 transition-colors"
      :class="[outerClass, borderClass]">
      <textarea
         v-model="value"
         v-bind="$attrs"
         :disabled="props.disabled"
         :class="{ 'opacity-60 cursor-not-allowed': props.disabled }"
         class="bg-transparent border-none outline-none placeholder:text-accent-300 text-white flex-1" />
   </div>
</template>
