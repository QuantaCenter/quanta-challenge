<script setup lang="ts">
import { Check } from '@icon-park/vue-next';

const props = defineProps<{
   done: boolean;
   size?: 'sm' | 'base';
}>();

const boxSize = computed(() => (props.size === 'sm' ? '1.5rem' : '2rem'));
const iconSize = computed(() => (props.size === 'sm' ? '0.875rem' : '1.125rem'));
</script>

<template>
   <div
      class="shrink-0 rounded-full flex items-center justify-center transition-colors"
      :class="props.done ? 'border-[3px] border-success text-success' : 'bg-primary'"
      :style="{ width: boxSize, height: boxSize }">
      <Check v-if="props.done" :size="iconSize" :strokeWidth="4" />
      <span
         v-else
         class="block ml-[0.1rem] w-0 h-0 border-y-transparent"
         :style="{
            borderLeftWidth: size === 'sm' ? '0.56rem' : '0.72rem',
            borderTopWidth: size === 'sm' ? '0.4rem' : '0.52rem',
            borderBottomWidth: size === 'sm' ? '0.4rem' : '0.52rem',
            borderLeftStyle: 'solid',
            borderLeftColor: '#ffffff',
         }" />
   </div>
</template>
