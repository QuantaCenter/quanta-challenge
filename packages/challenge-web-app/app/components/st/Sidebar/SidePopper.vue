<script setup lang="ts">
import { MINI_SIDEBAR_TOOLTIP_HIDDEN_KEY } from '~/components/st/MiniSidebar/type';

defineProps<{
   content: string;
}>();

const tooltipHidden = inject(MINI_SIDEBAR_TOOLTIP_HIDDEN_KEY, ref(false));
</script>

<template>
   <StPopover v-if="!tooltipHidden" placement="right" :z-index="10000">
      <template #popper="{ triggered }">
         <div
            class="px-3 py-2 rounded-lg bg-accent-600 text-white transition-all text-nowrap"
            :class="[triggered ? 'translate-x-0' : '-translate-x-2']">
            {{ content }}
         </div>
      </template>
      <slot></slot>
   </StPopover>
   <template v-else>
      <slot></slot>
   </template>
</template>
