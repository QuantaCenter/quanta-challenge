import type { Ref } from 'vue';

/**
 * 极简拖拽排序，基于原生 HTML5 DnD。
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
         // 光标越过目标行中点才换位，避免 dragover 来回震荡
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
