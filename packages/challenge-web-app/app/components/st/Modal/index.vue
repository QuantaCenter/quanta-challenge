<script setup lang="ts">
import type { RendererElement } from 'vue';

defineProps<{
   attachTo?: string | RendererElement;
}>();

const opened = defineModel<boolean>('opened', {
   default: true,
});
</script>

<template>
   <Teleport :to="attachTo ?? 'body'">
      <!--
         遮罩尺寸用视口单位而非 w-full/h-full：移动端内容溢出时布局视口会被撑大，
         百分比尺寸的 fixed 元素随之变大，导致居中偏移；同时只过渡透明度，避免尺寸变化被动画化。
      -->
      <StSpace
         center
         class="transition-opacity w-screen h-dvh bg-background/10 backdrop-blur-xs z-[10000] fixed left-0 top-0"
         :class="{
            'pointer-events-auto opacity-100': opened,
            'pointer-events-none opacity-0': !opened,
         }">
         <div
            class="transition-all"
            :class="{
               'scale-100 opacity-100': opened,
               'scale-95 opacity-0': !opened,
            }">
            <slot> </slot>
         </div>
      </StSpace>
   </Teleport>
</template>
