/** 仅在录制期间拦截页面可接收的键盘事件。 */
export const useKeyboardCapture = (
   onKeyDown: (event: KeyboardEvent) => void,
) => {
   const eventTypes = ['keydown', 'keypress', 'keyup'] as const;
   let active = false;

   const intercept = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.type === 'keydown') onKeyDown(event);
   };

   const stop = () => {
      if (!active) return;
      for (const type of eventTypes) {
         window.removeEventListener(type, intercept, true);
      }
      active = false;
   };

   const start = () => {
      if (active) return;
      for (const type of eventTypes) {
         window.addEventListener(type, intercept, {
            capture: true,
            passive: false,
         });
      }
      active = true;
   };

   onUnmounted(stop);

   return { start, stop };
};
