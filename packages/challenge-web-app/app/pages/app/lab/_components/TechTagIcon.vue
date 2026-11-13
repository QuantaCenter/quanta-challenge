<script setup lang="ts">
import type { DefineComponent } from 'vue';
import {
   Api,
   ChartHistogram,
   Code,
   Lightning,
   Paint,
   Tag,
   Terminal,
} from '@icon-park/vue-next';
import { LAB_TAG_ICON } from '@challenge/shared/lab-templates';

/**
 * 技术栈标签图标：实验室标签上传了图标时优先使用，其次用内置的品牌图标，都没有就用 IconPark 补齐。
 * 两种图标占用同一个正方形盒子（默认 0.875rem），保证大小一致。
 */

const props = defineProps<{
   name: string;
   /** 实验室标签上传的图标地址 */
   icon?: string;
}>();

const FALLBACK_ICON: Record<string, DefineComponent> = {
   API: Api as DefineComponent,
   HMR: Lightning as DefineComponent,
   SVG: Code as DefineComponent,
   Canvas: Paint as DefineComponent,
   图表: ChartHistogram as DefineComponent,
   终端: Terminal as DefineComponent,
};

const src = computed(() => props.icon || LAB_TAG_ICON[props.name]);
const fallback = computed(
   () => FALLBACK_ICON[props.name] ?? (Tag as DefineComponent),
);
</script>

<template>
   <span
      class="inline-flex size-3.5 shrink-0 items-center justify-center"
      aria-hidden="true">
      <img
         v-if="src"
         :src="src"
         alt=""
         class="size-full object-contain"
         draggable="false" />
      <Component :is="fallback" v-else size="0.875rem" />
   </span>
</template>
