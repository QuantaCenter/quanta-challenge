import type { Ref } from 'vue';

/**
 * 极简拖拽排序（原生 HTML5 DnD，不引第三方依赖）。
 *
 * 用法：列表里每一行绑 `draggable` 与 dragstart / dragover / drop / dragend，
 * 拖到某一行上就插到那一行的位置。`reset` 负责清掉高亮状态。
 */
export const useDragSort = <T>(list: Ref<T[]>) => {
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
