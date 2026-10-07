<script setup lang="ts">
import { ErrorPicture } from '@icon-park/vue-next';

const props = defineProps<{
   coverImageName?: string | null;
   // 封面的 thumbhash，用于在原图加载完成前渲染低清占位图
   coverImageThumbhash?: string | null;
   imgHeight?: string;
}>();

const imageSrc = computed(() =>
   props.coverImageName ? `/api/static/${props.coverImageName}` : '',
);
</script>

<template>
   <StSpace
      fill-x
      direction="vertical"
      gap="0.75rem"
      class="p-2 rounded-xl bg-accent-600 border hover:border-secondary/50 cursor-pointer border-transparent transition-all">
      <StImage
         :src="imageSrc"
         :thumbhash="props.coverImageThumbhash"
         :height="props.imgHeight || '9.76rem'"
         width="100%"
         alt="Cover Image">
         <template #fallback="{ style }">
            <StSpace
               fill
               center
               class="rounded-lg bg-accent-600/75 text-accent-500"
               :style="style">
               <ErrorPicture size="2rem" />
            </StSpace>
         </template>
      </StImage>
      <StSpace fill-x direction="vertical" gap="0.8rem" class="px-2">
         <slot></slot>
      </StSpace>
   </StSpace>
</template>
