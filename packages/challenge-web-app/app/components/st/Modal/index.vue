<script setup lang="ts">
import type { RendererElement } from 'vue';

const props = defineProps<{
   attachTo?: string | RendererElement;
   /** 点击遮罩（模态框外部）时关闭 */
   closeOnMask?: boolean;
   /** 打开期间冻结背景页面（含页面内的滚动容器） */
   lockScroll?: boolean;
}>();

const opened = defineModel<boolean>('opened', {
   default: true,
});

const active = ref(false);
const scrollLocks = new Map<HTMLElement, { property: string; value: string; priority: string }[]>();
const releaseScrollLock = () => {
   for (const [element, properties] of scrollLocks) {
      for (const { property, value, priority } of properties) {
         if (value) element.style.setProperty(property, value, priority);
         else element.style.removeProperty(property);
      }
   }
   scrollLocks.clear();
};
const acquireScrollLock = () => {
   if (!import.meta.client || scrollLocks.size) return;
   const targets = new Set<HTMLElement>([document.documentElement, document.body]);
   const collect = (element: Element) => {
      for (const child of Array.from(element.children)) {
         // 弹层及其内部列表继续独立滚动，背景容器才需要冻结。
         if (child.hasAttribute('data-st-modal-root') || child.hasAttribute('data-st-drawer-root')) continue;
         if (child instanceof HTMLElement) {
            const style = getComputedStyle(child);
            if (/(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)) targets.add(child);
         }
         collect(child);
      }
   };
   collect(document.body);
   for (const element of targets) {
      const properties = ['overflow-x', 'overflow-y'].map(property => ({
         property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property),
      }));
      scrollLocks.set(element, properties);
      for (const { property } of properties) element.style.setProperty(property, 'hidden', 'important');
   }
};
watch([opened, () => props.lockScroll, active], ([visible, lock, mounted]) => {
   if (visible && lock && mounted) acquireScrollLock();
   else releaseScrollLock();
}, { flush: 'post' });
onMounted(() => { active.value = true; });
onActivated(() => { active.value = true; });
onDeactivated(() => { active.value = false; releaseScrollLock(); });
onBeforeUnmount(releaseScrollLock);

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
         data-st-modal-root
         class="transition-opacity w-screen h-dvh bg-background/10 backdrop-blur-xs z-[10000] fixed left-0 top-0"
         :class="{
            'overscroll-none': lockScroll,
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
