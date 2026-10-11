<script setup lang="ts">
import { Box } from '@icon-park/vue-next';
import type { DefineComponent } from 'vue';

const props = withDefaults(
   defineProps<{
      content: string;
      /** 不传用默认图标；传 null 表示只要文字 */
      icon?: DefineComponent | null;
      /** 图标与文字之间的距离 */
      gap?: string;
   }>(),
   { gap: '1.5rem' },
);

const iconComponent = computed(() =>
   props.icon === null ? null : (props.icon ?? Box),
);
</script>

<template>
   <StSpace fill center>
      <StSpace
         direction="vertical"
         :gap="props.gap"
         align="center"
         class="text-accent-300">
         <Component
            v-if="iconComponent"
            :is="iconComponent"
            size="4rem"
            stroke-width="2px" />
         <div class="text-center text-muted">{{ props.content }}</div>
      </StSpace>
   </StSpace>
</template>
