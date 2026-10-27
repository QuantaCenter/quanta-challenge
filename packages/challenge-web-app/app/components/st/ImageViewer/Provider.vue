<script setup lang="ts">
import { X } from 'lucide-vue-next';
import type { GlobalImageState } from '~/composables/use-global-image';
import { useHistoryLayer } from '~/composables/use-history-layer';

const { state, finalizeClose } = useGlobalImageManager();

// 历史栈管理（composables/use-history-layer）：返回键逐层关闭弹层
const {
   acquire: acquireHistory,
   release: releaseHistory,
   onClose: onHistoryClose,
} = useHistoryLayer();

onHistoryClose(() => {
   // 返回键触发：历史已由 popstate 回退，这里只负责关闭查看器
   globalImage.close();
});

const visible = ref(false);
const overlayOn = ref(false); // 背景遮罩透明度
const imgReady = ref(false);
const imgError = ref(false);

// FLIP 动画状态
const flipTransform = ref<string | null>(null);
const flipAnimated = ref(false);
const imgOpacity = ref(1);
let sourceRect: DOMRect | null = null;
let hiddenSource: HTMLElement | null = null;
let animToken = 0;

// 缩放 / 平移状态
const scale = ref(1);
const px = ref(0);
const py = ref(0);
const panning = ref(false);
const MAX_SCALE = 8;
const MIN_SCALE = 0.5;

const natural = { w: 0, h: 0 };
const targetRect = ref<{ x: number; y: number; w: number; h: number } | null>(
   null
);

// ---------------- 工具 ----------------
const clamp = (v: number, min: number, max: number) =>
   Math.min(max, Math.max(min, v));

const nextFrame = () =>
   new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
   });

const panTransform = computed(
   () => `translate(${px.value}px, ${py.value}px) scale(${scale.value})`
);

const imgStyle = computed(() => {
   const t = targetRect.value;
   if (!t) return { display: 'none' };
   return {
      left: `${t.x}px`,
      top: `${t.y}px`,
      width: `${t.w}px`,
      height: `${t.h}px`,
      opacity: `${imgOpacity.value}`,
      transform: flipTransform.value ?? panTransform.value,
      transition: flipAnimated.value
         ? 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease'
         : panAnimated.value
           ? 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)'
           : 'none',
   };
});

/** 目标矩形：图片按原始比例 contain 适配视口并居中 */
function computeTargetRect() {
   if (!natural.w || !natural.h) return;
   const vw = window.innerWidth;
   const vh = window.innerHeight;
   const pad = vw < 640 ? 12 : 40;
   const s = Math.min((vw - pad * 2) / natural.w, (vh - pad * 2) / natural.h);
   const w = natural.w * s;
   const h = natural.h * s;
   targetRect.value = { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}

/** 计算 FLIP 变换：把已就位的目标矩形映射回源元素矩形 */
function computeFlipTransform(rect: DOMRect) {
   const t = targetRect.value;
   if (!t) return null;
   const dx = rect.left + rect.width / 2 - (t.x + t.w / 2);
   const dy = rect.top + rect.height / 2 - (t.y + t.h / 2);
   const s = rect.width / t.w || 1;
   return `translate(${dx}px, ${dy}px) scale(${s})`;
}

function hideSource(el: HTMLElement | null) {
   hiddenSource = el;
   if (el) {
      try {
         el.style.visibility = 'hidden';
      } catch {
         /* 元素可能已脱离文档 */
      }
   }
}

function restoreSource() {
   const el = hiddenSource;
   hiddenSource = null;
   if (el && el.isConnected) {
      try {
         el.style.visibility = '';
      } catch {
         /* ignore */
      }
   }
}

/** 预加载图片（无论成败都 resolve，失败时仍打开并展示错误态） */
function preloadImage(src: string) {
   return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
   });
}

async function onOpen(st: GlobalImageState) {
   const token = ++animToken;
   acquireHistory();
   imgReady.value = false;
   imgError.value = false;
   imgOpacity.value = st.source ? 1 : 0;
   scale.value = 1;
   px.value = 0;
   py.value = 0;
   flipTransform.value = null;
   flipAnimated.value = false;
   targetRect.value = null;
   natural.w = 0;
   natural.h = 0;
   sourceRect = null;

   // 预加载图片，就绪后再显示 Provider，避免空遮罩/加载态闪烁
   await preloadImage(st.src);
   if (token !== animToken) return;

   visible.value = true;
   overlayOn.value = true;
   // 先锁定滚动再测量源元素，避免滚动条消失引起布局位移
   document.documentElement.style.overflow = 'hidden';
   hideSource(st.source);
   await nextTick();
   if (token !== animToken) return;
   if (st.source?.isConnected) {
      sourceRect = st.source.getBoundingClientRect();
   }
}

function onImgLoad(e: Event) {
   const img = e.target as HTMLImageElement;
   natural.w = img.naturalWidth || img.width;
   natural.h = img.naturalHeight || img.height;
   computeTargetRect();
   imgReady.value = true;

   void (async () => {
      const token = animToken;
      await nextTick();
      if (token !== animToken) return;

      if (sourceRect) {
         // FLIP 进场：先无过渡地落在源元素位置，再过渡到居中目标位
         flipAnimated.value = false;
         flipTransform.value = computeFlipTransform(sourceRect);
         await nextFrame();
         if (token !== animToken) return;
         flipAnimated.value = true;
         flipTransform.value = null;
         window.setTimeout(() => {
            if (token !== animToken) return;
            flipAnimated.value = false;
            flipTransform.value = null;
         }, 450);
      } else {
         // 无源元素：淡入
         flipAnimated.value = false;
         imgOpacity.value = 0;
         await nextFrame();
         if (token !== animToken) return;
         flipAnimated.value = true;
         imgOpacity.value = 1;
         window.setTimeout(() => {
            if (token !== animToken) return;
            flipAnimated.value = false;
         }, 350);
      }
   })();
}

function onImgError() {
   imgError.value = true;
}

async function onCloseRequest(st: GlobalImageState) {
   const token = ++animToken;
   overlayOn.value = false;

   const canFlip =
      imgReady.value && !imgError.value && sourceRect && sourceRect.width > 0;

   if (canFlip && targetRect.value) {
      // FLIP 退场：从当前状态（含平移缩放）过渡回源元素位置
      flipAnimated.value = false;
      flipTransform.value = flipTransform.value ?? panTransform.value;
      scale.value = 1;
      px.value = 0;
      py.value = 0;
      await nextFrame();
      if (token !== animToken) return;
      flipAnimated.value = true;
      flipTransform.value = computeFlipTransform(sourceRect!);
   } else {
      flipAnimated.value = true;
      imgOpacity.value = 0;
   }

   window.setTimeout(() => {
      if (token !== animToken) return;
      restoreSource();
      visible.value = false;
      flipAnimated.value = false;
      flipTransform.value = null;
      targetRect.value = null;
      document.documentElement.style.overflow = '';
      releaseHistory();
      finalizeClose();
   }, canFlip ? 450 : 320);
}

/** 以视口坐标 (cx, cy) 为中心缩放到 targetScale */
function zoomAt(cx: number, cy: number, targetScale: number) {
   if (!imgReady.value || flipAnimated.value) return;
   const vw = window.innerWidth;
   const vh = window.innerHeight;
   const s0 = scale.value;
   const s1 = clamp(targetScale, MIN_SCALE, MAX_SCALE);
   if (Math.abs(s1 - s0) < 1e-4) return;

   const k = s1 / s0;
   const ox = cx - (vw / 2 + px.value);
   const oy = cy - (vh / 2 + py.value);
   px.value = cx - ox * k - vw / 2;
   py.value = cy - oy * k - vh / 2;
   scale.value = s1;
}

function onWheel(e: WheelEvent) {
   cancelPanAnim();
   zoomAt(e.clientX, e.clientY, scale.value * Math.exp(-e.deltaY * 0.0015));
}

// 双击缩放的平滑动画：临时启用 transform 过渡，被其他交互打断时立即恢复跟手
const panAnimated = ref(false);
let panAnimToken = 0;

function animatePan(duration = 320) {
   panAnimated.value = true;
   const token = ++panAnimToken;
   window.setTimeout(() => {
      if (token === panAnimToken) panAnimated.value = false;
   }, duration + 50);
}

function cancelPanAnim() {
   panAnimToken++;
   panAnimated.value = false;
}

function onDblClick(e: MouseEvent) {
   animatePan();
   zoomAt(e.clientX, e.clientY, scale.value > 1 ? 1 : 2.5);
}

type Point = { x: number; y: number };

// 指针事件：单指拖拽平移，双指捏合缩放
const pointers = new Map<number, Point>();
let pinchStart: {
   dist: number;
   scale: number;
   midX: number;
   midY: number;
   px: number;
   py: number;
} | null = null;
let lastPointer: Point | null = null;

function onPointerDown(e: PointerEvent) {
   if (e.button !== 0 || flipAnimated.value) return;
   cancelPanAnim();
   (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
   pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
   lastPointer = { x: e.clientX, y: e.clientY };

   if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [Point, Point];
      pinchStart = {
         dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
         scale: scale.value,
         midX: (a.x + b.x) / 2,
         midY: (a.y + b.y) / 2,
         px: px.value,
         py: py.value,
      };
   } else if (pointers.size === 1) {
      panning.value = true;
   }
}

function onPointerMove(e: PointerEvent) {
   if (!pointers.has(e.pointerId)) return;
   pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

   if (pointers.size >= 2 && pinchStart) {
      cancelPanAnim();
      const [a, b] = [...pointers.values()] as [Point, Point];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const target = pinchStart.scale * (dist / pinchStart.dist);
      const s1 = clamp(target, MIN_SCALE, MAX_SCALE);
      const k = s1 / pinchStart.scale;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const ox = pinchStart.midX - (vw / 2 + pinchStart.px);
      const oy = pinchStart.midY - (vh / 2 + pinchStart.py);
      px.value = pinchStart.midX - ox * k - vw / 2;
      py.value = pinchStart.midY - oy * k - vh / 2;
      scale.value = s1;
      return;
   }

   if (lastPointer && panning.value) {
      px.value += e.clientX - lastPointer.x;
      py.value += e.clientY - lastPointer.y;
   }
   lastPointer = { x: e.clientX, y: e.clientY };
}

function onPointerUp(e: PointerEvent) {
   pointers.delete(e.pointerId);
   if (pointers.size < 2) pinchStart = null;
   if (pointers.size === 0) {
      panning.value = false;
      lastPointer = null;
   }
}

function close() {
   globalImage.close();
}

function onBackdropClick() {
   if (!flipAnimated.value) close();
}

function onKeydown(e: KeyboardEvent) {
   if (e.key === 'Escape') close();
}

function onResize() {
   computeTargetRect();
}

watch(
   () => state.value.open,
   (open) => {
      if (open) {
         window.addEventListener('keydown', onKeydown);
         window.addEventListener('resize', onResize);
         void onOpen(state.value);
      } else {
         window.removeEventListener('keydown', onKeydown);
         window.removeEventListener('resize', onResize);
      }
   }
);

watch(
   () => state.value.closing,
   (closing) => {
      if (closing) void onCloseRequest(state.value);
   }
);

onBeforeUnmount(() => {
   restoreSource();
   releaseHistory();
   window.removeEventListener('keydown', onKeydown);
   window.removeEventListener('resize', onResize);
   document.documentElement.style.overflow = '';
});
const teleported = useClientTeleport();
</script>

<template>
   <Teleport to="body">
      <template v-if="teleported">
         <div
            v-show="visible"
            data-st-image-viewer
            class="fixed inset-0 z-[10000] touch-none select-none"
            @wheel.prevent="onWheel"
         >
            <div
               class="absolute inset-0 bg-black/80 transition-opacity duration-300"
               :class="overlayOn ? 'opacity-100' : 'opacity-0'"
               @click="onBackdropClick"
            />

            <img
               v-show="imgReady && !imgError"
               :src="state.src"
               :alt="state.alt"
               draggable="false"
               class="fixed max-w-none will-change-transform"
               :class="panning ? 'hover:cursor-grabbing' : 'hover:cursor-grab'"
               :style="imgStyle"
               @load="onImgLoad"
               @error="onImgError"
               @pointerdown="onPointerDown"
               @pointermove="onPointerMove"
               @pointerup="onPointerUp"
               @pointercancel="onPointerUp"
               @dblclick.prevent="onDblClick"
            />

            <div
               v-if="!imgReady && !imgError"
               class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            >
               <div
                  class="size-8 rounded-full border-2 border-white/25 border-t-white/85 animate-spin"
               />
            </div>
            <div
               v-else-if="imgError"
               class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-white/70"
            >
               图片加载失败
            </div>

            <button
               class="absolute top-4 right-4 hidden md:flex items-center justify-center size-10 rounded-full text-white/80 bg-white/30 hover:bg-white/50 transition-all duration-300 hover:cursor-pointer"
               :class="overlayOn ? 'opacity-100' : 'opacity-0'"
               title="关闭 (Esc)"
               @click="close"
            >
               <X :size="20" />
            </button>
         </div>
      </template>
   </Teleport>
</template>
