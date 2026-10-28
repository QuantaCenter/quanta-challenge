<script setup lang="ts">
import { DocDetail } from '@icon-park/vue-next';

const props = withDefaults(
   defineProps<{
      imageName?: string | null;
      height?: string;
      iconSize?: string;
   }>(),
   { imageName: null, height: '7.5rem', iconSize: '3.5rem' },
);

const imageUrl = computed(() =>
   props.imageName ? `/api/static/${encodeURIComponent(props.imageName)}` : '',
);
</script>

<template>
   <div
      class="relative overflow-hidden bg-accent-500/30"
      :style="{ height: props.height }">
      <StImage
         v-if="imageUrl"
         :src="imageUrl"
         width="100%"
         :height="props.height"
         object="cover"
         alt="文章封面" />
      <div
         v-else
         class="relative size-full overflow-hidden bg-gradient-to-br from-primary/70 via-secondary/30 to-accent-600">
         <DocDetail
            class="absolute -bottom-4 -right-3 rotate-12 text-white/20"
            :size="props.iconSize"
            :strokeWidth="2" />
         <div
            class="absolute inset-0 bg-[radial-gradient(circle_at_18%_118%,rgba(255,255,255,0.22),transparent_62%)]" />
      </div>
      <slot />
   </div>
</template>
