<script setup lang="ts">
import { Close } from '@icon-park/vue-next';

defineProps<{
   content: string;
}>();

defineEmits(['remove']);
</script>

<template>
   <StSpace
      gap="0.5rem"
      align="center"
      class="p-1 px-2 rounded-[0.375rem] text-xs bg-accent-500 text-accent-200 select-none cursor-pointer border border-transparent hover:border-primary">
      <div class="tab-label pointer-events-none text-nowrap whitespace-nowrap font-mono">
         {{ content }}
      </div>
      <div data-tab-close class="cursor-pointer" @click.stop="$emit('remove')">
         <slot name="remove-icon">
            <Close />
         </slot>
      </div>
   </StSpace>
</template>

<style scoped>
.tab-label {
   user-select: none;
   -webkit-user-select: none;
}
</style>
