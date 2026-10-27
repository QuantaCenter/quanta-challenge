<script setup lang="ts">
import { LoadingFour } from '@icon-park/vue-next';
import type { DefineComponent } from 'vue';

const props = defineProps<{
   icon: DefineComponent;
   loading?: boolean;
}>();

defineEmits(['click']);
</script>

<template>
   <StSpace
      center
      :class="[
         'size-[4.5rem] max-md:size-[2.25rem] rounded-full bg-accent-600 text-accent-200 outline-1',
         'outline-transparent hover:outline-secondary hover:text-white transition-all cursor-pointer',
      ]"
      @click="$emit('click')">
      <Component
         size="2rem"
         :is="props.loading ? LoadingFour : icon"
         :class="{ 'animate-spin text-accent-400': props.loading }" />
   </StSpace>
</template>

<style scoped>
@media (max-width: 47.99rem) {
   :deep(svg) {
      width: 1rem !important;
      height: 1rem !important;
   }
}
</style>
