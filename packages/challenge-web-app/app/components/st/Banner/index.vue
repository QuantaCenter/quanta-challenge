<script setup lang="ts">
import { Attention, CheckOne, CloseOne, Info } from '@icon-park/vue-next';
import type { Component } from 'vue';
import type { BannerType } from './type';

/** 提示横幅：默认插槽为主文案，`#description` 为次要说明；`sticky` 时吸附在滚动容器顶部 */
const props = withDefaults(
   defineProps<{
      type?: BannerType;
      sticky?: boolean;
      /** 自定义图标；传 null 不显示图标 */
      icon?: Component | null;
   }>(),
   { type: 'info', sticky: false, icon: undefined },
);

const TYPE_STYLES: Record<BannerType, { box: string; sticky: string; icon: string; Icon: Component }> = {
   info: {
      box: 'border-secondary/40 bg-secondary/5',
      sticky: 'bg-secondary/15',
      icon: 'text-secondary',
      Icon: Info,
   },
   warning: {
      box: 'border-warning/40 bg-warning/5',
      sticky: 'bg-warning/15',
      icon: 'text-warning',
      Icon: Attention,
   },
   error: {
      box: 'border-error/40 bg-error/5',
      sticky: 'bg-error/15',
      icon: 'text-error',
      Icon: CloseOne,
   },
   success: {
      box: 'border-success/40 bg-success/5',
      sticky: 'bg-success/15',
      icon: 'text-success',
      Icon: CheckOne,
   },
};

const style = computed(() => TYPE_STYLES[props.type]);
const iconComponent = computed(() =>
   props.icon === null ? null : (props.icon ?? style.value.Icon),
);
</script>

<template>
   <div
      role="status"
      class="w-full flex gap-3 px-4 py-3 rounded-[0.5rem] border text-sm leading-6"
      :class="[
         style.box,
         props.sticky && [
            'sticky top-0 z-10 shadow-lg backdrop-blur-md',
            style.sticky,
         ],
      ]">
      <component
         :is="iconComponent"
         v-if="iconComponent"
         size="1.125rem"
         class="shrink-0 mt-[0.1875rem]"
         :class="style.icon" />
      <div class="flex-1 min-w-0 break-words">
         <div class="text-accent-100">
            <slot />
         </div>
         <div v-if="$slots.description" class="text-accent-300">
            <slot name="description" />
         </div>
      </div>
   </div>
</template>
