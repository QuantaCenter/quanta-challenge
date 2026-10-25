<script setup lang="ts">
import { Teleport } from 'vue';

const props = defineProps<{
   global?: boolean;
   width?: string;
}>();

const opened = defineModel<boolean>('opened', {
   default: false,
});

// 抽屉打开期间锁定背后页面的滚动。锁状态直接记录在目标元素的 data 属性上
// （而非组件实例内存里）：热更新/页面更新销毁重建实例后，残留的锁也能被
// 识别并恢复，避免"抽屉关了但背景永远无法滚动"。
// 页面滚动容器不一定是 body（页面根节点常为 overflow-auto），因此遍历 DOM
// 找出所有当前真正可滚动的元素逐个冻结，并跳过抽屉自身的子树
const SCROLL_LOCK_ATTR = 'data-st-drawer-root';
const SCROLL_LOCKED_ATTR = 'data-st-drawer-scroll-locked';

const findLockedElements = (): HTMLElement[] =>
   import.meta.client
      ? Array.from(
           document.querySelectorAll<HTMLElement>(`[${SCROLL_LOCKED_ATTR}]`)
        )
      : [];

const lockScrollElement = (el: HTMLElement) => {
   if (el.hasAttribute(SCROLL_LOCKED_ATTR)) return;
   el.setAttribute(SCROLL_LOCKED_ATTR, '');
   el.dataset.stDrawerPrevOverflow = el.style.overflow;
   el.style.overflow = 'hidden';
};

const unlockScrollElement = (el: HTMLElement) => {
   el.style.overflow = el.dataset.stDrawerPrevOverflow ?? '';
   delete el.dataset.stDrawerPrevOverflow;
   el.removeAttribute(SCROLL_LOCKED_ATTR);
};

const collectScrollLockTargets = (): HTMLElement[] => {
   const targets: HTMLElement[] = [];
   const rootScroller = document.scrollingElement as HTMLElement | null;
   if (rootScroller) targets.push(rootScroller);
   const walk = (el: Element) => {
      for (const child of Array.from(el.children)) {
         if (child.hasAttribute(SCROLL_LOCK_ATTR)) continue;
         const htmlEl = child as HTMLElement;
         const { overflowY } = getComputedStyle(htmlEl);
         if (
            /(auto|scroll)/.test(overflowY) &&
            htmlEl.scrollHeight > htmlEl.clientHeight
         ) {
            targets.push(htmlEl);
         }
         walk(child);
      }
   };
   walk(document.body);
   return targets;
};

let scrollLockCount = 0;

const acquireScrollLock = () => {
   if (!import.meta.client) return;
   scrollLockCount++;
   if (scrollLockCount > 1) return;
   collectScrollLockTargets().forEach(lockScrollElement);
};

const releaseScrollLock = () => {
   if (!import.meta.client) return;
   scrollLockCount = Math.max(0, scrollLockCount - 1);
   if (scrollLockCount !== 0) return;
   findLockedElements().forEach(unlockScrollElement);
};

watch(
   opened,
   (value) => {
      if (value) acquireScrollLock();
      else releaseScrollLock();
   },
   { immediate: true }
);
onUnmounted(() => {
   if (opened.value) releaseScrollLock();
});
// KeepAlive 场景兜底：组件被停用/恢复时同样要释放/重取锁，
// 否则停用的抽屉会把计数卡在 >0，后续抽屉关闭时永远无法恢复滚动
onDeactivated(() => {
   if (opened.value) releaseScrollLock();
});
onActivated(() => {
   if (opened.value) acquireScrollLock();
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
   // 自愈：实例可能已被热更新/页面更新销毁重建，若 DOM 上残留滚动锁
   // 且当前没有任何打开的抽屉（锁的主人已死），立即恢复背景滚动
   const hasOpenDrawer = document.querySelector(
      '[data-st-drawer-root]:not(.hidden)'
   );
   if (!hasOpenDrawer) findLockedElements().forEach(unlockScrollElement);
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
         :data-st-drawer-root="true"
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
            <!-- 背景与面板一致（bg-black），滚动内容不会从把手行下面透出 -->
            <div
               @touchstart="onHandleTouchStart"
               @touchmove="onHandleTouchMove"
               @touchend="onHandleTouchEnd"
               @touchcancel="onHandleTouchEnd"
               class="absolute top-0 right-0 left-0 z-20 hidden max-md:flex justify-center pt-2 pb-1 bg-black max-md:rounded-t-[1rem] touch-none select-none">
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
