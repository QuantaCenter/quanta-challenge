import type { TemplateRef } from 'vue';

export interface IUseResizableOptions {
   initialWidth?: number;
   initialHeight?: number;
   minWidth?: number;
   minHeight?: number;
}

export const useResizable = (
   el: TemplateRef<HTMLElement>,
   options?: IUseResizableOptions
) => {
   const width = ref(options?.initialWidth ?? 0);
   const height = ref(options?.initialHeight ?? 0);
   const minWidth = ref(options?.minWidth ?? 0);
   const minHeight = ref(options?.minHeight ?? 0);
   const isResizing = ref(false);

   onMounted(() => {
      const handler = unref(el);
      if (!handler) return;

      handler.addEventListener('pointerdown', onStartResize);
      document.addEventListener('pointermove', onResizing);
      document.addEventListener('pointerup', onStopResize);
      document.addEventListener('pointercancel', onStopResize);
   });

   onUnmounted(() => {
      const handler = unref(el);
      if (!handler) return;

      handler.removeEventListener('pointerdown', onStartResize);
      document.removeEventListener('pointermove', onResizing);
      document.removeEventListener('pointerup', onStopResize);
      document.removeEventListener('pointercancel', onStopResize);
   });

   const startPosition = { x: 0, y: 0 };
   const onStartResize = (event: PointerEvent) => {
      isResizing.value = true;
      startPosition.x = event.clientX;
      startPosition.y = event.clientY;
      event.preventDefault();
   };

   const onResizing = (event: PointerEvent) => {
      if (!isResizing.value) return;

      const dx = event.clientX - startPosition.x;
      const dy = event.clientY - startPosition.y;

      width.value = Math.max(width.value + dx, minWidth.value);
      height.value = Math.max(height.value + dy, minHeight.value);

      startPosition.x = event.clientX;
      startPosition.y = event.clientY;

      event.preventDefault();
   };

   const onStopResize = (event: PointerEvent) => {
      if (!isResizing.value) return;

      const dx = event.clientX - startPosition.x;
      const dy = event.clientY - startPosition.y;

      width.value = Math.max(width.value + dx, minWidth.value);
      height.value = Math.max(height.value + dy, minHeight.value);

      isResizing.value = false;
      event.preventDefault();
   };

   return { width, height, isResizing };
};
