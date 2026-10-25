<script setup lang="ts">
import { Teleport } from 'vue';

const props = defineProps<{
   global?: boolean;
   width?: string;
}>();

const opened = defineModel<boolean>('opened', {
   default: false,
});

const rendered = ref(opened.value);
const shown = ref(opened.value);
let historyPushed = false;
let suppressNextPopstate = false;

watch(opened, (value) => {
   if (value) {
      rendered.value = true;
      if (!historyPushed && import.meta.client) {
         history.pushState({ stDrawer: true }, '');
         historyPushed = true;
      }
      nextTick(() => {
         requestAnimationFrame(() => {
            requestAnimationFrame(() => {
               shown.value = true;
            });
         });
      });
   } else {
      shown.value = false;
      if (historyPushed && import.meta.client) {
         historyPushed = false;
         suppressNextPopstate = true;
         history.back();
      }
      setTimeout(() => {
         if (!opened.value) rendered.value = false;
      }, 300);
   }
});

const onPopState = () => {
   if (suppressNextPopstate) {
      suppressNextPopstate = false;
      return;
   }
   if (opened.value) {
      historyPushed = false;
      opened.value = false;
   }
};

onMounted(() => {
   window.addEventListener('popstate', onPopState);
});

onUnmounted(() => {
   window.removeEventListener('popstate', onPopState);
   // 卸载时抽屉仍开着：回收压入的历史记录，避免留下一条"空"返回记录
   if (historyPushed && import.meta.client) {
      suppressNextPopstate = true;
      history.back();
   }
});

// 移动端底部抽屉：拖拽顶部把手下拉关闭。仅移动端渲染把手，桌面端不受影响
const DRAG_CLOSE_THRESHOLD = 80;
const dragOffset = ref(0);
const dragging = ref(false);
let dragStartY = 0;

const onHandleTouchStart = (e: TouchEvent) => {
   dragging.value = true;
   dragStartY = e.touches[0]!.clientY - dragOffset.value;
};
const onHandleTouchMove = (e: TouchEvent) => {
   if (!dragging.value) return;
   // 只允许向下拖，跟随手指位移
   dragOffset.value = Math.max(0, e.touches[0]!.clientY - dragStartY);
};
const onHandleTouchEnd = () => {
   if (!dragging.value) return;
   dragging.value = false;
   const shouldClose = dragOffset.value > DRAG_CLOSE_THRESHOLD;
   dragOffset.value = 0;
   if (shouldClose) opened.value = false;
};
watch(opened, () => {
   dragging.value = false;
   dragOffset.value = 0;
});
</script>

<template>
   <Component
      :is="global ? Teleport : 'div'"
      to="body"
      :class="{ 'pointer-events-none': !opened }"
      class="w-full h-full z-[9999]">
      <div
         @click.self="opened = false"
         :class="[
            global
               ? 'w-screen h-dvh fixed top-0 left-0'
               : 'w-full h-full',
            { 'pointer-events-none': !opened },
            {
               'bg-background/50 backdrop-blur-xs': opened,
               'opacity-0': !shown,
            },
            { hidden: !rendered },
         ]"
         class="z-[9999] flex items-center justify-end max-md:items-end max-md:justify-center overflow-hidden transition-all duration-300">
         <!-- 移动端（<md）为底部抽屉：全宽、90dvh、上圆角，从底部滑入；桌面端保持右侧抽屉。
              宽度走 CSS 变量而非内联 style，否则 max-md:w-full 无法覆盖它 -->
         <div
            class="st-drawer-panel relative h-dvh w-[var(--drawer-width)] bg-black border-l border-accent-600 text-white max-md:h-[90dvh] max-md:w-full max-md:rounded-t-[1rem] max-md:border-l-0 max-md:border-t"
            :class="[
               shown
                  ? 'right-0'
                  : 'md:translate-x-full max-md:translate-y-full',
               dragging ? 'transition-none' : 'transition-all duration-300',
            ]"
            :style="{
               '--drawer-width': props.width || 'fit-content',
               transform:
                  dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
            }">
            <!-- 移动端把手：指示可下拉，拖拽超过阈值关闭 -->
            <div
               @touchstart="onHandleTouchStart"
               @touchmove="onHandleTouchMove"
               @touchend="onHandleTouchEnd"
               @touchcancel="onHandleTouchEnd"
               class="absolute top-0 right-0 left-0 z-10 hidden max-md:flex justify-center pt-2 pb-1 touch-none select-none">
               <div class="h-1 w-10 rounded-full bg-accent-400"></div>
            </div>
            <slot></slot>
         </div>
      </div>
   </Component>
</template>

<style>
@media (max-width: 767.98px) {
   .st-drawer-panel {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
   }

   .st-drawer-panel::-webkit-scrollbar,
   .st-drawer-panel ::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      background: transparent !important;
   }
}
</style>
