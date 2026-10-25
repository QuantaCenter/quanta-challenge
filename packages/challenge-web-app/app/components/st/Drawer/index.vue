<script setup lang="ts">
import { Teleport } from 'vue';
import { useHistoryLayer } from '~/composables/use-history-layer';

const props = defineProps<{
   global?: boolean;
   width?: string;
   /**
    * 移动端（<md 底部抽屉）高度随内容自适应（不低于 40dvh、不超过 90dvh），
    * 桌面右侧抽屉不受影响。
    */
   fit?: boolean;
}>();

const opened = defineModel<boolean>('opened', {
   default: false,
});

// 抽屉打开期间锁定背后页面的滚动。锁状态直接记录在目标元素的 data 属性上；
// 遍历 DOM 找出所有当前真正可滚动的元素逐个冻结，并跳过抽屉自身的子树
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
// 组件被停用/恢复时同样要释放/重取锁
onDeactivated(() => {
   if (opened.value) releaseScrollLock();
});
onActivated(() => {
   if (opened.value) acquireScrollLock();
});

const rendered = ref(opened.value);
const shown = ref(opened.value);

// 历史栈管理（composables/use-history-layer）：支持返回键逐层关闭弹层
const {
   acquire: acquireHistory,
   release: releaseHistory,
   onClose: onHistoryClose,
} = useHistoryLayer();

onHistoryClose(() => {
   // 返回键触发：历史已由 popstate 回退，这里只负责关闭抽屉
   opened.value = false;
});

watch(opened, (value) => {
   if (value) {
      rendered.value = true;
      acquireHistory();
      nextTick(() => {
         requestAnimationFrame(() => {
            requestAnimationFrame(() => {
               shown.value = true;
            });
         });
      });
   } else {
      shown.value = false;
      // 主动关闭时回退自己压入的历史记录（若由返回键触发则仅出栈，不再回退）
      releaseHistory();
      setTimeout(() => {
         if (!opened.value) rendered.value = false;
      }, 300);
   }
});

onMounted(() => {
   // 自愈：DOM 上残留的滚动锁在无打开抽屉时立即恢复背景滚动
   const hasOpenDrawer = document.querySelector(
      '[data-st-drawer-root]:not(.hidden)'
   );
   if (!hasOpenDrawer) findLockedElements().forEach(unlockScrollElement);
});

onUnmounted(() => {
   // 卸载时抽屉仍开着：回收压入的历史记录（已释放时为空操作）
   releaseHistory();
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

// 点击遮罩关闭：阻止事件继续冒泡。非 global 模式下抽屉内联在页面 DOM 树中，
// 遮罩的 click 会穿过背后的页面容器；global 模式下也会传到 body/document
// 上的全局监听，这里统一在遮罩处截断
const onMaskClick = (event: MouseEvent) => {
   event.stopPropagation();
   opened.value = false;
};
</script>

<template>
   <Component
      :is="global ? Teleport : 'div'"
      to="body"
      :class="{ 'pointer-events-none': !opened }"
      class="w-full h-full z-[9999]">
      <div
         @click.self="onMaskClick"
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
         <div
            class="st-drawer-panel relative h-dvh w-[var(--drawer-width)] bg-black border-l border-accent-600 text-white max-md:w-full max-md:rounded-t-[1rem] max-md:border-l-0 max-md:border-t"
            :class="[
               shown
                  ? 'right-0'
                  : 'md:translate-x-full max-md:translate-y-full',
               dragging ? 'transition-none' : 'transition-all duration-300',
               // 移动端高度：默认固定 90dvh；fit 模式随内容自适应，
               // 不低于 40dvh，cap 到 90dvh
               props.fit
                  ? 'max-md:h-auto max-md:min-h-[40dvh] max-md:max-h-[90dvh]'
                  : 'max-md:h-[90dvh]',
            ]"
            :style="{
               '--drawer-width': props.width || 'fit-content',
               transform:
                  dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
            }">
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
