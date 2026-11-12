<script setup lang="ts">
import Color from 'color';
import type { DefineComponent } from 'vue';

const props = defineProps<{
   icon?: DefineComponent;
   tag: {
      name: string;
      color?: string | null;
      image?: { name: string } | null;
   };
   selected?: boolean;
   /** 选中态按 WCAG 对比度选择文字颜色（浅色主题色也会配深色文字），默认沿用全站的亮度阈值 */
   contrastText?: boolean;
}>();

const url = computed(() => {
   return `/api/static/${props.tag.image?.name}`;
});
const toggleColor = computed(() => {
   if (!props.tag.color) return '#6D6D6D';

   try {
      return Color(props.tag.color).hex();
   } catch {
      return '#6D6D6D';
   }
});
/** 选中态文字色：按实际背景亮度选深 / 浅色（无自定义颜色时背景是浅色 accent-100） */
const selectedTextClass = computed(() => {
   if (!props.tag.color) return 'text-accent-600';
   const dark = props.contrastText
      ? prefersDarkTextByContrast(toggleColor.value)
      : shouldUseBlackText(toggleColor.value);
   return dark ? 'text-accent-700' : 'text-white';
});
</script>

<template>
   <StSpace
      gap="0.5rem"
      align="center"
      class="h-[3.5rem] px-6 rounded-full cursor-pointer border-transparent border hover:border-[var(--c)] shrink-0 text-nowrap whitespace-nowrap"
      :class="
         props.selected
            ? ['bg-accent-100', selectedTextClass]
            : 'bg-accent-600 text-accent-100'
      "
      :style="{
         '--c': props.tag.color ?? '#6D6D6D',
         backgroundColor:
            props.selected && props.tag.color ? toggleColor : undefined,
      }">
      <img
         v-if="tag.image?.name"
         :src="url"
         :alt="tag.name"
         :style="{
            filter: props.selected
               ? 'drop-shadow(1px 0 0 #111) drop-shadow(-1px 0 0 #111)\
                     drop-shadow(0 1px 0 #111) drop-shadow(0 -1px 0 #111)'
               : undefined,
         }"
         class="size-7 m-0.5"
         :class="{ 'bg-blend-multiply isolate': props.selected }" />
      <Component v-else-if="icon" size="1.5rem" :is="icon" />
      <span class="font-family-manrope font-bold"> {{ tag.name }}</span>
   </StSpace>
</template>
