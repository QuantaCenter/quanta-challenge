<script setup lang="ts">
import { computed, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import { useLayoutStore, type EditorBoardId } from '~/stores/layout-store';
import { keyboardDelta, percentFromDrag } from '~/components/st/SplitPanel/layout-math';
import { resizeBoardPair } from '~/utils/board-layout';

/**
 * 做题页三个板块的容器：**拖拽换位** + 拖拽调整宽度。
 *
 * 板块内容由父组件通过具名插槽提供（`#board-files` / `#board-code` / `#board-preview`），
 * 所以每个板块的组件、ref、props 都留在编辑器页面里，不会被这里包一层而丢失引用。
 *
 * ## 为什么用 CSS `order` 而不是重排 DOM
 *
 * 三个板块的 DOM 顺序是**固定**的（files、code、preview），视觉顺序由 `order` 控制。
 * 换位时 Vue 不需要移动任何组件实例 —— 否则 Monaco、xterm 终端、预览 iframe 都会被
 * 卸载重建：终端里挂着的 WebContainer 进程会断，预览也会重新加载。
 * 实测这类重挂正是"开发容器起不来"最容易踩的坑之一。
 */
const layoutStore = useLayoutStore();

/** DOM 里固定的板块顺序（≠ 视觉顺序） */
const BOARD_IDS: EditorBoardId[] = ['files', 'code', 'preview'];
const BOARD_LABEL: Record<EditorBoardId, string> = {
   files: '资源管理器',
   code: '代码编辑器 / 终端',
   preview: '实时预览',
};
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

const boardEl = (id: EditorBoardId) =>
   container.value?.querySelector(`[data-board="${id}"]`) as HTMLElement | null;

/** 板块：视觉位置由 order 决定；宽度按同一顺序取 */
const boardStyle = (id: EditorBoardId) => {
   const index = order.value.indexOf(id);
   const percent = currentSizes.value[index] ?? 0;
   return {
      order: String(index * 2),
      // 用 flex-grow 的权重来表达百分比，而不是 flex-basis:
      // 两条分隔条各占 0.75rem，若用 basis 百分比，三者相加 100% 之后再加上分隔条
      // 就会超出容器（这正是 SplitPanel 早先"多出 0.5rem"的同一类 bug）。
      // flex-basis: 0 + grow 按权重分配的是**扣掉分隔条之后的剩余空间**，
      // 因此各板块的实际宽度比例严格等于这里的百分比，且永不溢出。
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

const handleDividerDown = (index: number, event: MouseEvent) => {
   if (layoutStore.locked) return;

   const leftId = order.value[index];
   const rightId = order.value[index + 1];
   if (!leftId || !rightId) return;

   const leftEl = boardEl(leftId);
   const rightEl = boardEl(rightId);
   if (!leftEl || !rightEl) return;

   event.preventDefault();

   const startSize = leftEl.offsetWidth;
   const endSize = rightEl.offsetWidth;
   const origin = event.clientX;
   let moved = false;

   const onMouseMove = (moveEvent: MouseEvent) => {
      const next = percentFromDrag({
         startSize,
         endSize,
         delta: moveEvent.clientX - origin,
      });
      if (next === null) return;
      moved = true;
      // 注意用的是**已落盘**的 sizes 作为基准，而不是上一帧的临时值
      draggingSizes.value = resizeBoardPair(sizes.value, index, next);
   };

   const onMouseUp = () => {
      detach();
      if (moved && draggingSizes.value) {
         layoutStore.setEditorBoardSizes(draggingSizes.value);
      }
      draggingSizes.value = null;
   };

   const detach = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      activeCleanup = null;
   };

   activeCleanup?.();
   activeCleanup = detach;
   document.addEventListener('mousemove', onMouseMove);
   document.addEventListener('mouseup', onMouseUp);
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
         @dragover.prevent="handleDragOver(id)"
         @dragleave="handleDragLeave(id)"
         @drop.prevent="handleDrop(id)">
         <slot :name="`board-${id}`" />

         <!--
            拖拽悬停高亮：画在板块**内部**的一层描边。
            不能用 ring/box-shadow —— 那是画在盒子外面的，而板块是满高、外层的
            内容区又带 overflow-hidden，上/下沿（以及最左/最右板块的外侧沿）会被裁掉，
            看起来就是"高亮不完整"。
         -->
         <div
            v-if="dragOverBoard === id"
            class="pointer-events-none absolute inset-0 z-30 rounded-xl border-2 border-primary" />

         <!--
            拖拽条：贴在板块顶部的一条 8px 窄条（悬停板块时出现 ⠿ 标记）。
            刻意做得又扁又靠边——每个板块的顶部左上角/右上角都有自己的按钮或标签页，
            放大到 20px 见方的把手会挡住它们（代码编辑器第一个标签页就是这么被挡的）。
         -->
         <div
            :draggable="!layoutStore.locked"
            :title="
               layoutStore.locked
                  ? '布局已锁定'
                  : `拖动这里把「${BOARD_LABEL[id]}」移到另一个板块的位置`
            "
            class="absolute inset-x-0 top-0 z-20 h-2 flex items-start justify-center"
            :class="
               layoutStore.locked
                  ? 'cursor-not-allowed'
                  : 'cursor-grab active:cursor-grabbing'
            "
            @dragstart="handleDragStart($event, id)"
            @dragend="handleDragEnd">
            <span
               class="rounded-b-md bg-accent-600/90 px-2 text-[0.65rem] leading-[0.8rem] text-accent-100 opacity-0 group-hover/board:opacity-100 transition-opacity">
               ⠿⠿
            </span>
         </div>
      </div>

      <!-- 分隔条 -->
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
         title="拖动调整两侧宽度；方向键微调（Shift 加速）"
         class="w-1 h-full mx-1 shrink-0 rounded-full transition-colors hover:bg-secondary cursor-col-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
         :class="{ 'opacity-0 hover:!cursor-default': layoutStore.locked }"
         @mousedown.left="handleDividerDown(index, $event)"
         @keydown="handleDividerKeydown(index, $event)" />
   </div>
</template>
