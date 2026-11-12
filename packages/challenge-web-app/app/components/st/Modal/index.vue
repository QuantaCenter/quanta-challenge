<script setup lang="ts">
import type { RendererElement } from 'vue';

const props = defineProps<{
   attachTo?: string | RendererElement;
   /** 点击遮罩（模态框外部）时关闭 */
   closeOnMask?: boolean;
}>();

const opened = defineModel<boolean>('opened', {
   default: true,
});

/** 仅当按下与抬起都发生在遮罩上才关闭，避免在内容里拖选文字、松开在外面时误关 */
let pressedOnMask = false;
const onMaskPointerDown = (event: PointerEvent) => {
   pressedOnMask = event.target === event.currentTarget;
};
const onMaskClick = (event: MouseEvent) => {
   if (!props.closeOnMask || !opened.value) return;
   if (pressedOnMask && event.target === event.currentTarget) {
      opened.value = false;
   }
   pressedOnMask = false;
};
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
         }"
         @pointerdown="onMaskPointerDown"
         @click="onMaskClick">
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
