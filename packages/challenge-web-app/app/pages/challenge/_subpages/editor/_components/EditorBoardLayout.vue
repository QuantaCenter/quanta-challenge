<script setup lang="ts">
import { computed, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import { useLayoutStore, type EditorBoardId } from '~/stores/layout-store';
import { keyboardDelta, percentFromDrag } from '~/components/st/SplitPanel/layout-math';
import { resizeBoardPair } from '~/utils/board-layout';

const layoutStore = useLayoutStore();

const props = withDefaults(
   defineProps<{ previewLabel?: string }>(),
   { previewLabel: '实时预览' },
);

/** DOM 里固定的板块顺序 */
const BOARD_IDS: EditorBoardId[] = ['files', 'code', 'preview'];
const BOARD_LABEL = computed<Record<EditorBoardId, string>>(() => ({
   files: '资源管理器',
   code: '代码编辑器 / 终端',
   preview: props.previewLabel,
}));
/** 三条板块之间有两条分隔条 */
const DIVIDER_INDEXES = [0, 1];

const container = useTemplateRef('container');

const order = computed(
   () => layoutStore.editorBoardLayout.order as EditorBoardId[]
);
const sizes = computed(() => layoutStore.editorBoardLayout.sizes);

/** 拖拽分隔条期间的临时宽度（不落盘，避免高频写 localStorage） */
const draggingSizes = ref<number[] | null>(null);
const currentSizes = computed(() => draggingSizes.value ?? sizes.value);

/** 正在拖拽的分隔条下标（仅用于把手的激活高亮） */
const draggingDivider = ref<number | null>(null);

const boardEl = (id: EditorBoardId) =>
   container.value?.querySelector(`[data-board="${id}"]`) as HTMLElement | null;

/** 板块：视觉位置由 order 决定；宽度按同一顺序取 */
const boardStyle = (id: EditorBoardId) => {
   const index = order.value.indexOf(id);
   const percent = currentSizes.value[index] ?? 0;
   return {
      order: String(index * 2),
      flexGrow: String(percent),
      flexShrink: '1',
      flexBasis: '0%',
   };
};

/** 分隔条：插在它两侧板块的 order 之间 */
const dividerStyle = (index: number) => ({ order: String(index * 2 + 1) });

// ————————————————— 拖拽换位 —————————————————
const draggingBoard = ref<EditorBoardId | null>(null);
const dragOverBoard = ref<EditorBoardId | null>(null);

const handleDragStart = (event: DragEvent, id: EditorBoardId) => {
   if (layoutStore.locked) return;
   draggingBoard.value = id;
   dragOverBoard.value = null;
   // Firefox 里不设置 dataTransfer 就不会真正开始拖拽
   event.dataTransfer?.setData('text/plain', id);
   if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
};

const handleDragOver = (id: EditorBoardId) => {
   if (!draggingBoard.value || draggingBoard.value === id) return;
   dragOverBoard.value = id;
};

const handleDragLeave = (id: EditorBoardId) => {
   if (dragOverBoard.value === id) dragOverBoard.value = null;
};

const handleDrop = (id: EditorBoardId) => {
   const from = draggingBoard.value;
   draggingBoard.value = null;
   dragOverBoard.value = null;
   if (from && from !== id) {
      layoutStore.moveEditorBoard(from, id);
   }
};

const handleDragEnd = () => {
   draggingBoard.value = null;
   dragOverBoard.value = null;
};

// ————————————————— 拖拽分隔条调宽度 —————————————————
let activeCleanup: (() => void) | null = null;

const handleDividerDown = (index: number, event: PointerEvent) => {
   if (layoutStore.locked) return;
   // pointerdown 对触摸也会触发，这里仅响应主键（左键 / 触屏）
   if (event.button !== 0) return;

   const leftId = order.value[index];
   const rightId = order.value[index + 1];
   if (!leftId || !rightId) return;

   const leftEl = boardEl(leftId);
   const rightEl = boardEl(rightId);
   if (!leftEl || !rightEl) return;

   event.preventDefault();

   draggingDivider.value = index;
   const startSize = leftEl.offsetWidth;
   const endSize = rightEl.offsetWidth;
   const origin = event.clientX;
   let moved = false;

   const onPointerMove = (moveEvent: PointerEvent) => {
      const next = percentFromDrag({
         startSize,
         endSize,
         delta: moveEvent.clientX - origin,
      });
      if (next === null) return;
      moved = true;
      draggingSizes.value = resizeBoardPair(sizes.value, index, next);
   };

   const onPointerUp = () => {
      detach();
      if (moved && draggingSizes.value) {
         layoutStore.setEditorBoardSizes(draggingSizes.value);
      }
      draggingSizes.value = null;
   };

   const detach = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      draggingDivider.value = null;
      activeCleanup = null;
   };

   activeCleanup?.();
   activeCleanup = detach;
   document.addEventListener('pointermove', onPointerMove);
   document.addEventListener('pointerup', onPointerUp);
   document.addEventListener('pointercancel', onPointerUp);
};

/** 键盘微调：与 SplitPanel 的分隔条行为保持一致 */
const handleDividerKeydown = (index: number, event: KeyboardEvent) => {
   if (layoutStore.locked) return;
   const delta = keyboardDelta('horizontal', event.key, event.shiftKey);
   if (delta === null) return;

   const pairTotal = (sizes.value[index] ?? 0) + (sizes.value[index + 1] ?? 0);
   if (pairTotal <= 0) return;

   const current = sizes.value[index] ?? 0;
   const next = ((current + delta) / pairTotal) * 100;
   const clamped = Math.min(Math.max(next, 10), 90);

   event.preventDefault();
   draggingSizes.value = resizeBoardPair(sizes.value, index, clamped);
   layoutStore.setEditorBoardSizes(draggingSizes.value);
   draggingSizes.value = null;
};

onUnmounted(() => activeCleanup?.());

// 「恢复默认布局」时把拖拽中的临时宽度也丢掉
watch(
   () => layoutStore.resetToken,
   () => {
      draggingSizes.value = null;
      draggingDivider.value = null;
      draggingBoard.value = null;
      dragOverBoard.value = null;
   }
);
</script>

<template>
   <div ref="container" class="relative w-full h-full flex flex-row">
      <!-- 板块：DOM 顺序固定，视觉顺序由 CSS order 决定（换位不重挂组件） -->
      <div
         v-for="id in BOARD_IDS"
         :key="id"
         :data-board="id"
         :style="boardStyle(id)"
         class="group/board relative h-full min-w-0 flex-shrink-0 rounded-xl"
         :class="{ 'pointer-events-none': draggingDivider !== null }"
         @dragover.prevent="handleDragOver(id)"
         @dragleave="handleDragLeave(id)"
         @drop.prevent="handleDrop(id)">
         <slot :name="`board-${id}`" />

         <div
            v-if="dragOverBoard === id"
            class="pointer-events-none absolute inset-0 z-30 rounded-xl border-2 border-primary" />

         <div
            :draggable="!layoutStore.locked"
            :title="
               layoutStore.locked
                  ? '布局已锁定'
                  : `拖动这里把「${BOARD_LABEL[id]}」移到另一个板块的位置`
            "
            class="absolute inset-x-0 top-0 z-20 flex h-3 items-start justify-center"
            :class="
               layoutStore.locked
                  ? 'cursor-not-allowed'
                  : 'cursor-grab active:cursor-grabbing'
            "
            @dragstart="handleDragStart($event, id)"
            @dragend="handleDragEnd">
            <span
               v-if="!layoutStore.locked"
               class="flex items-center justify-center rounded-b-lg border border-t-0 bg-accent-600/90 px-2.5 py-[0.3rem] shadow-sm transition-all duration-150"
               :class="
                  draggingBoard === id
                     ? 'border-primary/70 opacity-100'
                     : 'border-accent-500/60 opacity-0 group-hover/board:opacity-100 hover:opacity-100'
               ">
               <span
                  class="block h-[3px] w-7 rounded-full transition-colors duration-150"
                  :class="
                     draggingBoard === id ? 'bg-primary' : 'bg-accent-200/70'
                  " />
            </span>
         </div>
      </div>

      <div
         v-for="index in DIVIDER_INDEXES"
         :key="`divider-${index}`"
         :style="dividerStyle(index)"
         role="separator"
         aria-orientation="vertical"
         :aria-valuenow="Math.round(sizes[index] ?? 0)"
         :aria-valuemin="10"
         :aria-valuemax="90"
         :aria-label="`第 ${index + 1} 条面板分隔条`"
         :aria-disabled="layoutStore.locked"
         :tabindex="layoutStore.locked ? -1 : 0"
         class="group/divider flex w-1 h-full mx-1 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-secondary cursor-col-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
         style="touch-action: none"
         :class="{
            'opacity-0 hover:!cursor-default': layoutStore.locked,
            '!bg-secondary': draggingDivider === index,
         }"
         @pointerdown.left="handleDividerDown(index, $event)"
         @keydown="handleDividerKeydown(index, $event)">
         <div
            class="w-1 h-8 rounded-xl bg-accent-600 transition-colors group-hover/divider:bg-primary"
            :class="{ '!bg-primary': draggingDivider === index }" />
      </div>
   </div>
</template>
