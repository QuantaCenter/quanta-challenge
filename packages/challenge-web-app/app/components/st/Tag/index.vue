<script setup lang="ts">
import { CloseSmall } from '@icon-park/vue-next';

const props = defineProps<{
   content: string;
   color?: string;
   closable?: boolean;
   size?: 'small' | 'base';
   /** 按 WCAG 对比度选择文字颜色（浅色主题色也会配深色文字），默认沿用全站的亮度阈值 */
   contrastText?: boolean;
}>();

defineEmits(['close']);

const textColorClass = computed(() => {
   const color = props.color ?? '#FA7C0E';
   const dark = props.contrastText
      ? prefersDarkTextByContrast(color)
      : shouldUseBlackText(color);
   return dark ? 'text-accent-700' : 'text-white';
});

const size = computed(() => props.size ?? 'base');
</script>

<template>
   <StSpace
      align="center"
      no-wrap
      gap="0.375rem"
      :style="{ backgroundColor: color || '#FA7C0E' }"
      :class="[
         textColorClass,
         {
            'pl-[0.875rem] pr-2 py-[0.25rem]': size === 'base',
            'px-[0.5rem] py-[0.25rem]': size === 'small',
         },
      ]"
      class="rounded-[0.375rem] w-fit hover:cursor-auto">
      <span :class="[size === 'base' ? 'text-[0.875rem]' : 'text-[0.625rem]']">
         {{ content }}
      </span>
      <StSpace
         v-if="closable"
         center
         no-shrink
         @click="$emit('close')"
         class="size-5 rounded-full hover:bg-white/20 hover:cursor-pointer">
         <CloseSmall />
      </StSpace>
   </StSpace>
</template>
