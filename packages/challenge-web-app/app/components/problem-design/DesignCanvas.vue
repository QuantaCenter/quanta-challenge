<script setup lang="ts">
import {
   clamp,
   intersects,
   measureRects,
   round,
   zoomAt,
   type Camera,
   type DesignDocument,
   type DesignNode,
   type Rect,
   type Tool,
} from '@quantacenter/page2design';
import { CanvasRenderer, loadDocumentResources } from '@quantacenter/page2design/canvas';
import { LoaderCircle } from 'lucide-vue-next';

const RULER_SIZE = 24;
const TAP_SLOP = 6;
type ClientPoint = Pick<MouseEvent, 'clientX' | 'clientY'>;

const props = defineProps<{
   design: DesignDocument;
   tool: Tool;
   rulers: boolean;
   bottomInset: number;
   selected?: DesignNode;
   hovered?: DesignNode;
   measured?: DesignNode;
}>();
const emit = defineEmits<{
   hover: [node?: DesignNode];
   pick: [node?: DesignNode];
   scale: [scale: number];
}>();

const stage = ref<HTMLDivElement>();
const canvas = ref<HTMLCanvasElement>();
const renderer = shallowRef<CanvasRenderer>();
const canvasStatus = ref<'loading' | 'ready' | 'failed'>('loading');
const unavailableAssets = ref(false);
const viewport = ref({ width: 0, height: 0 });
const camera = ref<Camera>({ x: 0, y: 0, scale: 1 });
const panning = ref(false);
let drag: { id: number; clientX: number; clientY: number; camera: Camera } | undefined;
const touchPoints = new Map<number, ClientPoint>();
let touchOrigin: ClientPoint | undefined;
let hoverPointer: ClientPoint | undefined;
let followingFit = true;
let fitPage = false;

function fit(all = true) {
   const { width, height } = viewport.value;
   if (!width || !height) return;
   const rulerOffset = props.rulers ? RULER_SIZE : 0;
   const frameWidth = width - rulerOffset;
   const frameHeight = height - rulerOffset - props.bottomInset;
   const artboardHeight = all ? props.design.height : Math.min(props.design.viewport.height, props.design.height);
   const scale = clamp(
      Math.min((frameWidth - 48) / props.design.width, (frameHeight - 72) / artboardHeight),
      0.1,
      1,
   );
   camera.value = {
      x: rulerOffset + (frameWidth - props.design.width * scale) / 2,
      y: rulerOffset + Math.max(37, (frameHeight - artboardHeight * scale) / 2),
      scale,
   };
   followingFit = true;
   fitPage = all;
}

function zoom(factor: number, point?: { x: number; y: number }) {
   const center = point ?? {
      x: viewport.value.width / 2,
      y: Math.max(0, viewport.value.height - props.bottomInset) / 2,
   };
   camera.value = zoomAt(camera.value, center, camera.value.scale * factor);
   followingFit = false;
}

function reveal(box: Rect) {
   const { width, height } = viewport.value;
   const edge = props.rulers ? RULER_SIZE : 0;
   const visibleHeight = height - edge - props.bottomInset;
   if (width <= edge || visibleHeight <= 0) return;
   const visibleArea = { x: edge, y: edge, width: width - edge, height: visibleHeight };
   const rect = screenRect(box);
   if (intersects(rect, visibleArea)) return;
   pan(
      edge + visibleArea.width / 2 - (rect.x + rect.width / 2),
      edge + visibleArea.height / 2 - (rect.y + rect.height / 2),
   );
}

defineExpose({ fit, zoom, reveal });

useResizeObserver(stage, ([entry]) => {
   const { width, height } = entry.contentRect;
   viewport.value = { width, height };
   if (followingFit) fit(fitPage);
});
watch([() => props.rulers, () => props.bottomInset], () => {
   if (followingFit) fit(fitPage);
});
watch(() => camera.value.scale, () => emit('scale', camera.value.scale), { immediate: true });

watch(() => props.design, async (design, _, onCleanup) => {
   if (import.meta.server) return;
   const controller = new AbortController();
   let instance: CanvasRenderer | undefined;
   onCleanup(() => {
      instance?.dispose();
      controller.abort();
      renderer.value = undefined;
   });

   canvasStatus.value = 'loading';
   unavailableAssets.value = false;
   fit(false);
   try {
      const resources = await loadDocumentResources(design, {
         signal: controller.signal,
         reference: false,
      });
      if (controller.signal.aborted) return;
      instance = new CanvasRenderer(design, resources);
      renderer.value = instance;
      unavailableAssets.value = resources.errors.length > 0;
      canvasStatus.value = 'ready';
   } catch {
      if (!controller.signal.aborted) {
         controller.abort();
         canvasStatus.value = 'failed';
      }
   }
}, { immediate: true });

watch([canvas, viewport, camera, renderer], ([element, size, view, instance]) => {
   if (!element || !instance || !size.width || !size.height) return;
   try {
      instance.render(element, {
         ...size,
         camera: view,
         pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      });
   } catch {
      canvasStatus.value = 'failed';
   }
}, { flush: 'post' });

function pointerPosition(event: ClientPoint) {
   const rect = stage.value?.getBoundingClientRect();
   return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
}

function pick(event: ClientPoint) {
   if (canvasStatus.value !== 'ready') return;
   const point = pointerPosition(event);
   const { width, height } = viewport.value;
   const edge = props.rulers ? RULER_SIZE : 0;
   if (point.x < edge || point.y < edge || point.x >= width || point.y >= height) return;
   return renderer.value?.hitTest(point, camera.value) ?? undefined;
}

function updateHover() {
   if (!hoverPointer) return;
   emit('hover', !panning.value && props.tool !== 'hand' ? pick(hoverPointer) : undefined);
}

function clearHover() {
   hoverPointer = undefined;
   emit('hover');
}

watch([camera, viewport, canvasStatus, () => props.tool, () => props.rulers], updateHover);
useEventListener('blur', () => {
   clearHover();
   if (touchPoints.size) {
      touchPoints.clear();
      touchOrigin = undefined;
      panning.value = false;
   }
});

function pan(x: number, y: number, view = camera.value) {
   camera.value = { x: view.x + x, y: view.y + y, scale: view.scale };
   followingFit = false;
}

function onPointerDown(event: PointerEvent) {
   if (event.pointerType === 'touch') {
      if (drag) return;
      if (!touchPoints.size) {
         touchOrigin = event;
         clearHover();
      } else {
         touchOrigin = undefined;
         panning.value = true;
      }
      touchPoints.set(event.pointerId, event);
      stage.value?.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
   }
   if (touchPoints.size) return;
   if (event.button === 1 || (event.button === 0 && props.tool === 'hand')) {
      drag = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, camera: camera.value };
      stage.value?.setPointerCapture(event.pointerId);
      panning.value = true;
      clearHover();
      event.preventDefault();
   } else if (event.button === 0) {
      emit('pick', pick(event));
   }
}

function onTouchMove(event: PointerEvent) {
   const previous = touchPoints.get(event.pointerId);
   if (!previous) return;
   touchPoints.set(event.pointerId, event);
   if (touchPoints.size === 1) {
      const origin = touchOrigin ?? previous;
      const x = event.clientX - origin.clientX;
      const y = event.clientY - origin.clientY;
      if (touchOrigin && Math.hypot(x, y) < TAP_SLOP) return;
      touchOrigin = undefined;
      panning.value = true;
      pan(x, y);
      return;
   }

   // A third finger does not replace the current pinch pair.
   const [first, second] = [...touchPoints.entries()];
   if (!first || !second) return;
   const partner = event.pointerId === first[0] ? second[1] : event.pointerId === second[0] ? first[1] : undefined;
   if (!partner) return;
   const before = Math.max(1, Math.hypot(previous.clientX - partner.clientX, previous.clientY - partner.clientY));
   const after = Math.max(1, Math.hypot(event.clientX - partner.clientX, event.clientY - partner.clientY));
   const midpoint = pointerPosition({
      clientX: (previous.clientX + partner.clientX) / 2,
      clientY: (previous.clientY + partner.clientY) / 2,
   });
   const zoomed = zoomAt(camera.value, midpoint, camera.value.scale * after / before);
   pan((event.clientX - previous.clientX) / 2, (event.clientY - previous.clientY) / 2, zoomed);
}

function onPointerMove(event: PointerEvent) {
   if (event.pointerType === 'touch') {
      onTouchMove(event);
   } else if (drag?.id === event.pointerId) {
      pan(event.clientX - drag.clientX, event.clientY - drag.clientY, drag.camera);
   } else if (!touchPoints.size) {
      hoverPointer = event;
      updateHover();
   }
}

function endPan(event: PointerEvent) {
   if (event.pointerType === 'touch') {
      if (!touchPoints.delete(event.pointerId) || touchPoints.size) return;
      const origin = touchOrigin;
      touchOrigin = undefined;
      panning.value = false;
      if (event.type === 'pointerup' && origin && props.tool !== 'hand'
         && Math.hypot(event.clientX - origin.clientX, event.clientY - origin.clientY) < TAP_SLOP) {
         emit('pick', pick(event));
      }
      return;
   }
   if (drag?.id !== event.pointerId) return;
   drag = undefined;
   panning.value = false;
   if (event.type === 'pointerup') {
      hoverPointer = event;
      updateHover();
   }
}

function onWheel(event: WheelEvent) {
   const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.value.height : 1;
   hoverPointer = event;
   if (event.ctrlKey || event.metaKey) {
      zoom(Math.exp(-event.deltaY * multiplier / 250), pointerPosition(event));
   } else {
      pan(-event.deltaX * multiplier, -event.deltaY * multiplier);
   }
}

const artboard = computed(() => {
   const { x, y, scale } = camera.value;
   return { x, y, width: props.design.width * scale, height: props.design.height * scale };
});

function screenRect(rect: Rect): Rect {
   const { x, y, scale } = camera.value;
   return { x: rect.x * scale + x, y: rect.y * scale + y, width: rect.width * scale, height: rect.height * scale };
}

const selection = computed(() => props.selected && screenRect(props.selected.box));
const highlight = computed(() => {
   const node = props.measured ?? props.hovered;
   return node && node.id !== props.selected?.id ? screenRect(node.box) : undefined;
});
const measurements = computed(() => {
   if (!props.selected || !props.measured) return [];
   const { x, y, scale } = camera.value;
   return measureRects(props.selected.box, props.measured.box).map((segment) => ({
      x1: segment.x1 * scale + x,
      y1: segment.y1 * scale + y,
      x2: segment.x2 * scale + x,
      y2: segment.y2 * scale + y,
      labelX: (segment.x1 + segment.x2) / 2 * scale + x + (segment.axis === 'y' ? 25 : 0),
      labelY: (segment.y1 + segment.y2) / 2 * scale + y - (segment.axis === 'x' ? 11 : 0),
      label: `${round(segment.value)} px`,
   }));
});

function rulerTicks(origin: number, length: number) {
   if (!props.rulers || length <= RULER_SIZE) return [];
   const scale = camera.value.scale;
   const targetDistance = 68 / scale;
   const magnitude = 10 ** Math.floor(Math.log10(targetDistance));
   const interval = (targetDistance <= magnitude * 2 ? 2 : targetDistance <= magnitude * 5 ? 5 : 10) * magnitude;
   const step = interval / 5;
   const start = Math.ceil((RULER_SIZE - origin) / (step * scale));
   const end = Math.floor((length - origin) / (step * scale));
   return Array.from({ length: Math.max(0, end - start + 1) }, (_, offset) => {
      const index = start + offset;
      const value = index * step;
      return { value, position: origin + value * scale, major: index % 5 === 0 };
   });
}

const horizontalTicks = computed(() => rulerTicks(camera.value.x, viewport.value.width));
const verticalTicks = computed(() => rulerTicks(camera.value.y, viewport.value.height));
</script>

<template>
   <div
      ref="stage"
      class="relative min-h-0 min-w-0 touch-none overflow-hidden bg-[#212121] bg-[radial-gradient(#383838_1px,transparent_1px)] bg-size-[16px_16px] bg-position-[-1px_-1px]"
      :class="{ 'hover:cursor-grabbing': panning, 'hover:cursor-grab': !panning && tool === 'hand', 'hover:cursor-crosshair': tool === 'measure' && !panning }"
      role="region"
      aria-label="设计画板"
      @pointerdown="onPointerDown"
      @pointerenter="onPointerMove"
      @pointermove="onPointerMove"
      @pointerup="endPan"
      @pointercancel="endPan"
      @lostpointercapture="endPan"
      @pointerleave="clearHover"
      @wheel.prevent="onWheel"
   >
      <div
         v-if="canvasStatus === 'ready'"
         class="pointer-events-none absolute bg-white/5 shadow-[0_8px_40px_#0007] ring-1 ring-white/15"
         :style="{ left: `${artboard.x}px`, top: `${artboard.y}px`, width: `${artboard.width}px`, height: `${artboard.height}px` }"
      >
         <span class="absolute bottom-full mb-1.5 whitespace-nowrap font-family-manrope text-[10px] tabular-nums text-accent-200">
            {{ design.width }} × {{ design.height }}
         </span>
      </div>
      <canvas ref="canvas" class="absolute inset-0 size-full" aria-label="设计稿画布"></canvas>
      <svg v-if="selection || highlight" class="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
         <rect v-if="selection" v-bind="selection" fill="none" stroke="#ff9a43" stroke-width="1.5" />
         <rect v-if="highlight" v-bind="highlight" :fill="measured ? '#ff668a18' : 'none'" :stroke="measured ? '#ff668a' : '#ffb778'" stroke-dasharray="4 3" />
         <g v-for="(segment, index) in measurements" :key="index">
            <line :x1="segment.x1" :y1="segment.y1" :x2="segment.x2" :y2="segment.y2" stroke="#ff668a" />
            <circle :cx="segment.x1" :cy="segment.y1" r="2" fill="#ff668a" />
            <circle :cx="segment.x2" :cy="segment.y2" r="2" fill="#ff668a" />
            <rect :x="segment.labelX - segment.label.length * 3.25 - 4" :y="segment.labelY - 8" :width="segment.label.length * 6.5 + 8" height="16" rx="4" fill="#ba244a" />
            <text :x="segment.labelX" :y="segment.labelY" class="font-family-manrope text-[10px] tabular-nums" text-anchor="middle" dominant-baseline="central" fill="white">{{ segment.label }}</text>
         </g>
      </svg>
      <svg v-if="rulers" class="pointer-events-none absolute inset-0 size-full select-none hover:cursor-default" aria-hidden="true">
         <rect width="100%" :height="RULER_SIZE" fill="#292929" class="pointer-events-auto" @pointerdown.stop />
         <rect :width="RULER_SIZE" height="100%" fill="#292929" class="pointer-events-auto" @pointerdown.stop />
         <path d="M24 0V10000 M0 24H10000" fill="none" stroke="#3d3d3d" />
         <g v-for="tick in horizontalTicks" :key="tick.value" :transform="`translate(${tick.position} 0)`">
            <path :d="tick.major ? 'M0 15V24' : 'M0 20V24'" stroke="#686868" />
            <text v-if="tick.major" x="3" y="12" fill="#c5c5c5" class="font-family-manrope text-[9px] tabular-nums">{{ round(tick.value) }}</text>
         </g>
         <g v-for="tick in verticalTicks" :key="tick.value" :transform="`translate(0 ${tick.position})`">
            <path :d="tick.major ? 'M15 0H24' : 'M20 0H24'" stroke="#686868" />
            <text v-if="tick.major" transform="translate(11 -3) rotate(-90)" fill="#c5c5c5" class="font-family-manrope text-[9px] tabular-nums">{{ round(tick.value) }}</text>
         </g>
      </svg>

      <div v-if="canvasStatus !== 'ready'" class="pointer-events-none absolute inset-0 grid place-items-center" role="status">
         <p v-if="canvasStatus === 'loading'" class="flex items-center gap-2 rounded-md bg-[#222] px-4 py-3 text-xs text-accent-200">
            <LoaderCircle :size="16" class="animate-spin" />
            正在绘制设计稿
         </p>
         <p v-else class="rounded-md bg-[#222] px-4 py-3 text-xs">设计稿绘制失败</p>
      </div>
      <p v-else-if="unavailableAssets" class="pointer-events-none absolute bottom-(--design-toolbar-inset) left-8 rounded-md bg-[#222] px-2 py-1 text-[10px] text-accent-200" role="status">
         部分设计素材未能解码
      </p>
      <p v-if="measured && measurements.length === 0" class="pointer-events-none absolute right-3 bottom-(--design-toolbar-inset) rounded-md bg-[#49222e] px-2 py-1 text-[10px] text-[#ffd6df]" role="status">
         两个图层的边界重叠
      </p>
   </div>
</template>
