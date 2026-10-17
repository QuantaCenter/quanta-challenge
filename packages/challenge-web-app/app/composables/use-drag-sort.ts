import type { Ref } from 'vue';

/**
 * 极简拖拽排序（原生 HTML5 DnD，不引第三方依赖）。
 *
 * 用法：列表里每一行绑 `draggable` 与 dragstart / dragover / drop / dragend。
 * 默认拖过时只高亮目标行，松手才落位；传 `liveReorder` 则拖过即换位，
 * 配合 TransitionGroup 的 move 动画，其余行会实时平滑让位。
 */
export const useDragSort = <T>(
   list: Ref<T[]>,
   options: { liveReorder?: boolean } = {},
) => {
   const draggingIndex = ref<number | null>(null);
   const overIndex = ref<number | null>(null);

   const reset = () => {
      draggingIndex.value = null;
      overIndex.value = null;
   };

   const onDragStart = (index: number, event: DragEvent) => {
      draggingIndex.value = index;
      overIndex.value = index;
      if (event.dataTransfer) {
         event.dataTransfer.effectAllowed = 'move';
         // Firefox 必须 setData 才会真正开始拖拽
         event.dataTransfer.setData('text/plain', String(index));
      }
   };

   const onDragOver = (index: number, event: DragEvent) => {
      if (draggingIndex.value === null) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      if (options.liveReorder) {
         // 拖过即换位，但必须满足两个条件才换，否则列表一重排、
         // 行在光标下滑动，dragover 交替命中两行，会来回震荡（视觉上抽搐）：
         // 1. 只跟相邻行换——快速跨多行时 dragover 会连续触发，逐行收敛
         // 2. 光标越过目标行的垂直中点才换——换完后目标位就是自己，天然静止
         if (index === draggingIndex.value) return;
         const step = index - draggingIndex.value;
         if (Math.abs(step) !== 1) return;
         const target = event.currentTarget;
         if (!(target instanceof HTMLElement)) return;
         const rect = target.getBoundingClientRect();
         const belowMidpoint = event.clientY > rect.top + rect.height / 2;
         if ((step === 1) !== belowMidpoint) return;
         const next = [...list.value];
         const [moved] = next.splice(draggingIndex.value, 1);
         if (moved !== undefined) next.splice(index, 0, moved);
         list.value = next;
         draggingIndex.value = index;
         return;
      }
      overIndex.value = index;
   };

   const onDrop = (index: number, event: DragEvent) => {
      event.preventDefault();
      const from = draggingIndex.value;
      if (from === null || from === index) {
         reset();
         return;
      }
      const next = [...list.value];
      const [moved] = next.splice(from, 1);
      if (moved !== undefined) next.splice(index, 0, moved);
      list.value = next;
      reset();
   };

   return {
      draggingIndex,
      overIndex,
      onDragStart,
      onDragOver,
      onDrop,
      onDragEnd: reset,
   };
};
