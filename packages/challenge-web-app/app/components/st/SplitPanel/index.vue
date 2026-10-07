<script setup lang="ts">
import { computed, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import { useDefaultCursor } from '~/composables/use-default-cursor';
import { useLayoutStore } from '~/stores/layout-store';
import {
   MIN_PANEL_PERCENT,
   clampPercent,
   computeFlexBasis,
   keyboardDelta,
   percentFromDrag,
   percentFromFit,
} from './layout-math';

const props = defineProps<{
   direction: 'horizontal' | 'vertical';
   startPercent?: number;
   /**
    * 持久化标识：给了它，用户拖出来的比例会被记住（刷新后保持，
    * 并可通过做题页侧边栏的「布局」菜单重置）。
    */
   storageKey?: string;
}>();

const layoutStore = useLayoutStore();
const container = useTemplateRef('container');
const startPanel = useTemplateRef('startPanel');
const endPanel = useTemplateRef('endPanel');

const isDragging = ref(false);

/** 示例级锁定（终端折叠时锁住），与全局锁定取或 */
const instanceLocked = ref(false);
const locked = computed(() => instanceLocked.value || layoutStore.locked);

/**
 * 拖拽/自适应产生的**临时**比例；为 null 时回落到持久化值或 `start-percent`。
 * 分成两层是为了让「重置布局」能生效：清掉持久化值后，组件会自然回到默认比例。
 */
const override = ref<number | null>(null);

const defaultPercent = () => clampPercent(props.startPercent ?? 50);
const persistedPercent = computed(() =>
   layoutStore.getPanelSize(props.storageKey, defaultPercent())
);
const startPercentage = computed(
   () => override.value ?? persistedPercent.value
);
const basis = computed(() => computeFlexBasis(startPercentage.value));

const applyPercent = (value: number | null, persist = false) => {
   if (value === null || !Number.isFinite(value)) return;
   const next = clampPercent(value);

   // 有持久化标识时：落盘之后必须**清掉本地覆盖值**。
   // 本地覆盖的优先级高于持久化值（见 startPercentage），留着它会导致
   // 「恢复默认布局」清空持久化值后面板纹丝不动 —— 看起来就是按钮没生效。
   if (persist && props.storageKey) {
      override.value = null;
      layoutStore.setPanelSize(props.storageKey, next);
      return;
   }

   override.value = next;
};

// start-percent 变化时清掉临时值，让外部重新掌控比例
watch(
   () => props.startPercent,
   () => {
      override.value = null;
   }
);

// 处理拖拽事件
let activeMouseMove: ((event: MouseEvent) => void) | null = null;
let activeMouseUp: (() => void) | null = null;

const detachDragListeners = () => {
   if (activeMouseMove) {
      document.removeEventListener('mousemove', activeMouseMove);
   }
   if (activeMouseUp) {
      document.removeEventListener('mouseup', activeMouseUp);
   }
   activeMouseMove = null;
   activeMouseUp = null;
};

const handleResize = (event: MouseEvent) => {
   if (!container.value || isDragging.value || locked.value) return;

   const startEl = container.value.children[0] as HTMLElement | undefined;
   const endEl = container.value.children[2] as HTMLElement | undefined;
   if (!startEl || !endEl) return;

   event.preventDefault();

   const isHorizontal = props.direction === 'horizontal';
   isDragging.value = true;

   // 根据方向获取相应的尺寸（拖拽过程中保持不变，用于把鼠标位移换算成比例）
   const startSize = isHorizontal ? startEl.offsetWidth : startEl.offsetHeight;
   const endSize = isHorizontal ? endEl.offsetWidth : endEl.offsetHeight;
   const origin = isHorizontal ? event.clientX : event.clientY;

   const onMouseMove = (moveEvent: MouseEvent) => {
      const current = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
      const next = percentFromDrag({
         startSize,
         endSize,
         delta: current - origin,
      });
      // null = 已经拖到最小比例，保持上一次的有效值
      if (next !== null) override.value = next;
   };

   const onMouseUp = () => {
      isDragging.value = false;
      detachDragListeners();
      // 拖拽结束才落盘，避免拖动过程中高频写 localStorage；
      // applyPercent 会顺手清掉本地覆盖值，否则「恢复默认布局」清不掉它
      applyPercent(override.value, true);
   };

   // 先清掉可能残留的监听（例如上一次拖拽期间组件被卸载）
   detachDragListeners();
   activeMouseMove = onMouseMove;
   activeMouseUp = onMouseUp;
   document.addEventListener('mousemove', onMouseMove);
   document.addEventListener('mouseup', onMouseUp);
};

/** 键盘可达：方向键微调（Shift 加速），Home 恢复默认 */
const handleResizeKeydown = (event: KeyboardEvent) => {
   if (locked.value) return;

   if (event.key === 'Home') {
      event.preventDefault();
      applyPercent(defaultPercent(), true);
      return;
   }

   const delta = keyboardDelta(props.direction, event.key, event.shiftKey);
   if (delta === null) return;

   event.preventDefault();
   applyPercent(
      clampPercent(
         startPercentage.value + delta,
         MIN_PANEL_PERCENT,
         100 - MIN_PANEL_PERCENT
      ),
      true
   );
};

// 设置拖拽时的光标样式
const { set, reset } = useDefaultCursor({ el: container });
watch(isDragging, (val) => {
   if (val) {
      set(props.direction === 'horizontal' ? 'col-resize' : 'row-resize');
   } else {
      reset();
   }
});

onUnmounted(() => {
   // 拖拽中卸载时不清监听会留下悬挂的 document 监听 + isDragging 卡在 true
   detachDragListeners();
   reset();
});

// 自动调整面板大小以适应内容
const resizeToFit = async (place: 'start' | 'end') => {
   await nextTick();
   const panel = place === 'start' ? startPanel.value : endPanel.value;
   const side = props.direction === 'horizontal' ? 'width' : 'height';

   const size = panel?.firstElementChild?.getBoundingClientRect()[side] ?? 0;
   const containerSize = container.value?.getBoundingClientRect()[side] ?? 0;

   // 自适应结果**不落盘**：它通常是「终端折叠」这类临时状态，
   // 而折叠状态本身并不持久化，落盘会导致刷新后卡在折叠高度。
   applyPercent(percentFromFit({ place, contentSize: size, containerSize }));
};

// 面板状态存储与恢复（供终端折叠使用，仅在内存中）
const savedPercent = ref<number | null>(null);
const storePanelState = () => {
   savedPercent.value = startPercentage.value;
};
const restorePanelState = () => {
   applyPercent(savedPercent.value);
};

// 「恢复默认布局」：把组件内部的临时状态也清掉。
// 只清持久化值是不够的 —— 拖拽留下的 override 与终端折叠的存档优先级都更高，
// 清完持久化值后面板不会回到默认比例（这正是"按钮点了没反应"的原因）。
watch(
   () => layoutStore.resetToken,
   () => {
      override.value = null;
      savedPercent.value = null;
   }
);

// 锁定面板比例
const setPanelLockState = (state: boolean) => {
   instanceLocked.value = state;
};

export interface IPanelMethods {
   resizeToFit: () => Promise<void>;
   setPanelLockState: (state: boolean) => void;
   storePanelState: () => void;
   restorePanelState: () => void;
}

// 提供给子组件的方法
const methodsToProvide = {
   start: {
      resizeToFit: () => resizeToFit('start'),
      setPanelLockState,
      storePanelState,
      restorePanelState,
   } satisfies IPanelMethods,
   end: {
      resizeToFit: () => resizeToFit('end'),
      setPanelLockState,
      storePanelState,
      restorePanelState,
   } satisfies IPanelMethods,
};
</script>

<template>
   <div
      ref="container"
      class="w-full h-full flex"
      :class="{
         'flex-row': direction === 'horizontal',
         'flex-col': direction === 'vertical',
      }">
      <!-- START -->
      <div
         ref="startPanel"
         :style="{
            flexBasis: basis.start,
            pointerEvents: isDragging ? 'none' : 'auto',
         }"
         class="flex-shrink-0">
         <slot name="start" v-bind="methodsToProvide.start"></slot>
      </div>
      <!-- RESIZER -->
      <div
         role="separator"
         :aria-orientation="direction === 'horizontal' ? 'vertical' : 'horizontal'"
         :aria-valuenow="Math.round(startPercentage)"
         :aria-valuemin="MIN_PANEL_PERCENT"
         :aria-valuemax="100 - MIN_PANEL_PERCENT"
         :aria-label="direction === 'horizontal' ? '左右面板分隔条' : '上下面板分隔条'"
         :aria-disabled="locked"
         :tabindex="locked ? -1 : 0"
         :title="
            locked
               ? '面板已锁定'
               : '拖动调整面板大小；双击或按 Home 恢复默认'
         "
         @mousedown.left="handleResize"
         @dblclick="applyPercent(defaultPercent(), true)"
         @keydown="handleResizeKeydown"
         class="flex items-center justify-center hover:bg-secondary group transition-colors shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
         :class="{
            'w-1 h-full mx-1 hover:cursor-col-resize':
               direction === 'horizontal',
            'w-full h-1 my-1 hover:cursor-row-resize': direction === 'vertical',
            '!bg-secondary': isDragging,
            'opacity-0 hover:!cursor-default': locked,
         }">
         <div
            class="rounded-xl group-hover:bg-primary bg-accent-600 transition-colors"
            :class="{
               'w-1 h-8': direction === 'horizontal',
               'w-8 h-1': direction === 'vertical',
               '!bg-primary': isDragging,
            }"></div>
      </div>
      <!-- END -->
      <div
         ref="endPanel"
         :style="{
            flexBasis: basis.end,
            pointerEvents: isDragging ? 'none' : 'auto',
         }"
         class="flex-shrink-0">
         <slot name="end" v-bind="methodsToProvide.end"></slot>
      </div>
   </div>
</template>
