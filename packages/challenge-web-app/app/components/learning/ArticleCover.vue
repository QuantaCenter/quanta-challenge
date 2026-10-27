<script setup lang="ts">
import { DocDetail } from '@icon-park/vue-next';
import {
   articleCoverClass,
   type ArticleCoverPreset,
} from '~/composables/use-learning';

/**
 * 文章封面。没有上传图片时按预设渲染一块渐变，并复用发布流程卡片那套
 * 「角落一枚倾斜大图标」的装饰手法，保证「有位置、不空、也不花」。
 */
const props = withDefaults(
   defineProps<{
      preset?: ArticleCoverPreset | null;
      url?: string | null;
      height?: string;
      /** 卡片列表里用小图标，详情页可以放大 */
      iconSize?: string;
   }>(),
   { preset: null, url: null, height: '7.5rem', iconSize: '3.5rem' },
);
</script>

<template>
   <div
      class="relative overflow-hidden bg-accent-500/30"
      :style="{ height: props.height }">
      <StImage
         v-if="props.url"
         :src="props.url"
         width="100%"
         :height="props.height"
         object="cover"
         alt="文章封面" />

      <div
         v-else
         class="size-full relative overflow-hidden bg-gradient-to-br"
         :class="articleCoverClass(props.preset)">
         <DocDetail
            class="absolute -right-3 -bottom-4 rotate-12 text-white/20"
            :size="props.iconSize"
            :strokeWidth="2" />
         <div
            class="absolute inset-0 bg-[radial-gradient(circle_at_18%_118%,rgba(255,255,255,0.22),transparent_62%)]" />
      </div>

      <slot />
   </div>
</template>
