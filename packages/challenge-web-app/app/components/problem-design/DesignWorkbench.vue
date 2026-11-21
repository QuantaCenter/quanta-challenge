<script setup lang="ts">
import type { DesignDocument, DesignNode, Tool } from '@quantacenter/page2design';
import {
   Hand,
   Layers3,
   Maximize,
   Minus,
   MousePointer2,
   Plus,
   Ruler,
   ScanLine,
   SlidersHorizontal,
   X,
} from 'lucide-vue-next';
import { FocusScope, SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui';
import DesignCanvas from './DesignCanvas.vue';
import DesignLayers from './DesignLayers.vue';
import DesignProperties from './DesignProperties.vue';
import type { DesignUnit } from './design-inspection';

const props = defineProps<{ design: DesignDocument }>();
const rootFontSize = computed(() => {
   const root = props.design.nodes.find(node => node.tag === 'html');
   return Number.parseFloat(root?.style['font-size'] ?? '');
});
const stage = ref<InstanceType<typeof DesignCanvas>>();
const toolbar = useTemplateRef<HTMLDivElement>('toolbar');
const { height: toolbarHeight } = useElementSize(toolbar, { width: 0, height: 42 }, { box: 'border-box' });
const toolbarInset = computed(() => toolbarHeight.value + 24);
const tools = [
   { value: 'select', label: '选择 (V)', icon: MousePointer2 },
   { value: 'hand', label: '平移 (H)', icon: Hand },
   { value: 'measure', label: '测量 (M)', icon: ScanLine },
] as const;
const toolButtonClass = [
   'size-7 shrink-0 place-items-center rounded-full text-accent-200',
   'transition-colors enabled:hover:cursor-pointer enabled:hover:bg-white/15 enabled:hover:text-white enabled:active:bg-white/25',
   'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
   'aria-pressed:bg-primary/15 aria-pressed:text-[#ffb47a]',
   'aria-pressed:enabled:hover:bg-primary/30 aria-pressed:enabled:hover:text-[#ffd0ab] aria-pressed:enabled:active:bg-primary/40',
   'disabled:hover:cursor-not-allowed disabled:opacity-35',
].join(' ');
const resizeHandleClass = [
   'relative w-2 shrink-0 bg-[#191919] transition-colors',
   'before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-white/10',
   'hover:cursor-col-resize hover:bg-white/10 hover:before:bg-primary',
   'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
   'data-[state=drag]:bg-primary/15 data-[state=drag]:before:bg-primary',
   '[@media(max-width:720px)]:hidden',
].join(' ');
const compact = useMediaQuery('(max-width: 720px)');
const initialWidth = import.meta.client ? Math.max(721, window.innerWidth) : 1280;
const panelWidth = initialWidth - 16;
const defaultLayersSize = Math.max(16, (170 / panelWidth) * 100);
const defaultPropertiesSize = Math.max(23, (220 / panelWidth) * 100);
const tool = ref<Tool>('select');
const showRulers = ref(true);
type DrawerPane = 'layers' | 'properties';
const drawerPane = ref<DrawerPane>('layers');
const drawerOpen = ref(false);
const drawerBody = useTemplateRef<HTMLElement>('drawer-body');
const layersOpener = useTemplateRef<HTMLButtonElement>('layers-opener');
const propertiesOpener = useTemplateRef<HTMLButtonElement>('properties-opener');
const expandedLayers = ref<Record<string, boolean>>({});
const inspectionUnit = ref<DesignUnit>('px');
let drawerOpener: HTMLElement | undefined;
const scale = ref(1);
const altHeld = ref(false);
const selected = shallowRef<DesignNode>();
const hovered = shallowRef<DesignNode>();
const measurePin = shallowRef<DesignNode>();
const measuring = computed(() => tool.value === 'measure' || (tool.value === 'select' && altHeld.value));
const measured = computed(() => {
   if (!measuring.value || !selected.value) return undefined;
   return measurePin.value ?? (hovered.value?.id !== selected.value.id ? hovered.value : undefined);
});

watch(measuring, (active) => {
   if (!active) measurePin.value = undefined;
});
watch(compact, (value) => {
   if (!value) drawerOpen.value = false;
});
watch([drawerOpen, drawerPane], async ([open], [wasOpen]) => {
   await nextTick();
   if (open && drawerOpen.value) {
      drawerBody.value?.focus({ preventScroll: true });
   } else if (!drawerOpen.value && wasOpen) {
      if (drawerOpener?.isConnected) drawerOpener.focus({ preventScroll: true });
      drawerOpener = undefined;
   }
});

function setTool(next: Tool) {
   tool.value = next;
   measurePin.value = undefined;
}

function pick(node?: DesignNode) {
   if (measuring.value && selected.value && node) {
      measurePin.value = node.id === selected.value.id ? undefined : node;
      return;
   }
   selected.value = node;
   measurePin.value = undefined;
   if (node && compact.value && tool.value === 'select' && !measuring.value) openDrawer('properties');
}

function pickLayer(node: DesignNode) {
   pick(node);
   stage.value?.reveal(node.box);
}

function openDrawer(next: DrawerPane, event?: MouseEvent) {
   if (!drawerOpen.value) {
      const trigger = event?.currentTarget ?? document.activeElement;
      drawerOpener = trigger instanceof HTMLElement && trigger !== document.body
         ? trigger
         : (next === 'layers' ? layersOpener.value : propertiesOpener.value) ?? undefined;
   }
   drawerPane.value = next;
   drawerOpen.value = true;
   altHeld.value = false;
   hovered.value = undefined;
}

useEventListener('keydown', (event: KeyboardEvent) => {
   if (drawerOpen.value) {
      if (event.key === 'Escape' && !event.defaultPrevented) {
         drawerOpen.value = false;
         event.preventDefault();
      }
      return;
   }
   const target = event.target;
   if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, select, textarea'))) return;
   if (event.ctrlKey || event.metaKey || event.defaultPrevented) return;
   switch (event.key.toLowerCase()) {
      case 'alt':
         altHeld.value = true;
         break;
      case 'v':
         setTool('select');
         break;
      case 'h':
         setTool('hand');
         break;
      case 'm':
         setTool('measure');
         break;
      case 'r':
         if (!event.repeat) showRulers.value = !showRulers.value;
         break;
      case 'f':
         stage.value?.fit();
         break;
      case '+':
      case '=':
         stage.value?.zoom(1.25);
         break;
      case '-':
         stage.value?.zoom(0.8);
         break;
      case 'escape':
         hovered.value = undefined;
         pick();
         break;
      default:
         return;
   }
   if (event.key !== 'Alt') event.preventDefault();
});
useEventListener('keyup', (event: KeyboardEvent) => {
   if (event.key === 'Alt') altHeld.value = false;
});
useEventListener('blur', () => {
   altHeld.value = false;
   hovered.value = undefined;
});
</script>

<template>
   <section class="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="设计稿检查器">
      <SplitterGroup
         direction="horizontal"
         :keyboard-resize-by="2"
         class="relative min-h-0 flex-1 [@media(max-width:720px)]:block!">
         <SplitterPanel
            :default-size="defaultLayersSize"
            :min-size="14"
            :max-size="35"
            class="min-w-0 [@media(max-width:720px)]:hidden">
            <DesignLayers
               v-if="!compact"
               v-model:expanded="expandedLayers"
               :design="design"
               :selected-id="selected?.id"
               :hovered-id="hovered?.id"
               class="size-full"
               @pick="pickLayer"
               @hover="hovered = $event"
            />
         </SplitterPanel>
         <SplitterResizeHandle
            :disabled="compact"
            :class="resizeHandleClass"
            aria-label="调整图层宽度"
            aria-orientation="vertical"
         />
         <SplitterPanel :default-size="100 - defaultLayersSize - defaultPropertiesSize" :min-size="22" class="relative min-w-0 [@media(max-width:720px)]:size-full">
            <DesignCanvas
               ref="stage"
               :design="design"
               :tool="tool"
               :rulers="showRulers"
               :selected="selected"
               :hovered="hovered"
               :measured="measured"
               :bottom-inset="toolbarInset"
               class="size-full"
               @hover="hovered = $event"
               @pick="pick"
               @scale="scale = $event"
            />
            <div
               ref="toolbar"
               class="absolute bottom-4 left-1/2 z-2 flex w-max max-w-[calc(100%_-_1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-[22px] border border-accent-500/60 bg-accent-600/75 p-1.5 shadow-lg shadow-black/50 backdrop-blur-2xl backdrop-saturate-150"
               role="group"
               aria-label="设计工具">
               <div class="flex items-center gap-0.5">
                  <StPopover
                     v-for="option in tools"
                     :key="option.value"
                     :content="option.label"
                     placement="top"
                     class="flex shrink-0"
                     tooltip>
                     <button
                        type="button"
                        class="inline-grid"
                        :class="toolButtonClass"
                        :aria-label="option.label"
                        :aria-pressed="tool === option.value"
                        @click="setTool(option.value)">
                        <component :is="option.icon" :size="16" />
                     </button>
                  </StPopover>
                  <StPopover
                     :content="showRulers ? '隐藏标尺 (R)' : '显示标尺 (R)'"
                     placement="top"
                     class="flex shrink-0"
                     tooltip>
                     <button
                        type="button"
                        class="inline-grid"
                        :class="toolButtonClass"
                        aria-label="标尺 (R)"
                        :aria-pressed="showRulers"
                        @click="showRulers = !showRulers">
                        <Ruler :size="16" />
                     </button>
                  </StPopover>
               </div>
               <div class="flex items-center gap-0.5">
                  <span class="mr-1.5 h-4 w-px shrink-0 bg-white/15" aria-hidden="true" />
                  <div class="flex items-center gap-0.5 [@media(max-width:720px)]:hidden">
                     <StPopover content="缩小 (-)" placement="top" class="flex shrink-0" tooltip>
                        <button type="button" class="inline-grid" :class="toolButtonClass" aria-label="缩小 (-)" :disabled="scale <= 0.1" @click="stage?.zoom(0.8)">
                           <Minus :size="16" />
                        </button>
                     </StPopover>
                     <span class="w-8 text-center font-family-manrope text-xs tabular-nums">{{ Math.round(scale * 100) }}%</span>
                     <StPopover content="放大 (+)" placement="top" class="flex shrink-0" tooltip>
                        <button type="button" class="inline-grid" :class="toolButtonClass" aria-label="放大 (+)" :disabled="scale >= 4" @click="stage?.zoom(1.25)">
                           <Plus :size="16" />
                        </button>
                     </StPopover>
                     <span class="mx-1.5 h-4 w-px shrink-0 bg-white/15" aria-hidden="true" />
                  </div>
                  <StPopover content="缩放至整张设计图 (F)" placement="top" class="flex shrink-0" tooltip>
                     <button type="button" class="inline-grid" :class="toolButtonClass" aria-label="缩放至整张设计图 (F)" @click="stage?.fit()">
                        <Maximize :size="15" />
                     </button>
                  </StPopover>
                  <StPopover
                     content="显示图层"
                     placement="top"
                     class="hidden shrink-0 [@media(max-width:720px)]:flex"
                     tooltip>
                     <button
                        ref="layers-opener"
                        type="button"
                        class="inline-grid"
                        :class="toolButtonClass"
                        aria-label="切换图层"
                        aria-haspopup="dialog"
                        :aria-expanded="drawerOpen && drawerPane === 'layers'"
                        @click="openDrawer('layers', $event)">
                        <Layers3 :size="16" />
                     </button>
                  </StPopover>
                  <StPopover
                     content="显示元素信息"
                     placement="top"
                     class="hidden shrink-0 [@media(max-width:720px)]:flex"
                     tooltip>
                     <button
                        ref="properties-opener"
                        type="button"
                        class="inline-grid"
                        :class="toolButtonClass"
                        aria-label="切换元素信息"
                        aria-haspopup="dialog"
                        :aria-expanded="drawerOpen && drawerPane === 'properties'"
                        @click="openDrawer('properties', $event)">
                        <SlidersHorizontal :size="16" />
                     </button>
                  </StPopover>
               </div>
            </div>
         </SplitterPanel>
         <SplitterResizeHandle
            :disabled="compact"
            :class="resizeHandleClass"
            aria-label="调整元素信息宽度"
            aria-orientation="vertical"
         />
         <SplitterPanel
            :default-size="defaultPropertiesSize"
            :min-size="19"
            :max-size="43"
            class="min-w-0 [@media(max-width:720px)]:hidden">
            <DesignProperties
               v-if="!compact"
               v-model:unit="inspectionUnit"
               :node="selected"
               :root-font-size="rootFontSize"
               class="size-full" />
         </SplitterPanel>
      </SplitterGroup>

      <StDrawer
         v-if="compact"
         v-slot="{ rendered }"
         v-model:opened="drawerOpen"
         mobile-height="75dvh"
         background-color="#191919"
         panel-class="shadow-[0_-6px_18px_#0005]"
         require-backdrop-press
         global>
         <FocusScope v-if="rendered" :trapped="drawerOpen" loop as-child @mount-auto-focus.prevent @unmount-auto-focus.prevent>
            <div
               ref="drawer-body"
               class="flex h-full min-h-0 flex-col overflow-hidden pt-4 pb-[env(safe-area-inset-bottom)] text-accent-100"
               role="dialog"
               aria-modal="true"
               :aria-label="drawerPane === 'layers' ? '图层' : '元素信息'"
               :inert="!drawerOpen"
               tabindex="-1">
               <DesignLayers
                  v-show="drawerPane === 'layers'"
                  v-model:expanded="expandedLayers"
                  :design="design"
                  :selected-id="selected?.id"
                  :hovered-id="hovered?.id"
                  class="flex-1"
                  @pick="pickLayer"
                  @hover="hovered = $event">
                  <template #header-actions>
                     <button
                        type="button"
                        class="ml-1 grid"
                        :class="toolButtonClass"
                        aria-label="关闭图层抽屉"
                        @click="drawerOpen = false">
                        <X :size="16" aria-hidden="true" />
                     </button>
                  </template>
               </DesignLayers>
               <DesignProperties
                  v-show="drawerPane === 'properties'"
                  v-model:unit="inspectionUnit"
                  :node="selected"
                  :root-font-size="rootFontSize"
                  class="flex-1">
                  <template #header-actions>
                     <button
                        type="button"
                        class="grid"
                        :class="toolButtonClass"
                        aria-label="关闭元素信息抽屉"
                        @click="drawerOpen = false">
                        <X :size="16" aria-hidden="true" />
                     </button>
                  </template>
               </DesignProperties>
            </div>
         </FocusScope>
      </StDrawer>
   </section>
</template>
