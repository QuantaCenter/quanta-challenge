<script setup lang="ts">
import { Check, PlayOne } from '@icon-park/vue-next';

const props = defineProps<{
   done: boolean;
   size?: 'sm' | 'base';
}>();

const boxSize = computed(() => (props.size === 'sm' ? '1.25rem' : '2rem'));
const iconSize = computed(() => (props.size === 'sm' ? '0.75rem' : '1.125rem'));
const playSize = computed(() => (props.size === 'sm' ? '1rem' : '1.5rem'));
</script>

<template>
   <div
      class="shrink-0 rounded-full flex items-center justify-center transition-colors"
      :class="props.done ? 'border-[3px] border-success text-success' : 'bg-primary'"
      :style="{ width: boxSize, height: boxSize }">
      <Check v-if="props.done" :size="iconSize" :strokeWidth="4" />
      <PlayOne
         v-else
         class="text-white"
         theme="filled"
         :size="playSize"
         :strokeWidth="4" />
   </div>
</template>
