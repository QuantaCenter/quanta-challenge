/**
 * 移动端判定（断点与 Tailwind max-md: 一致：<768px）。
 *
 * SSR 与客户端首帧恒为 false，mounted 后才同步真实值并跟随变化；
 * 该标记只可用于 v-if 等渲染分支，且首帧内容需与"移动端不可见"兼容。
 */
export const useIsMobile = () => {
   const isMobile = ref(false);

   let mql: MediaQueryList | null = null;
   const onChange = (event: MediaQueryListEvent) => {
      isMobile.value = event.matches;
   };

   onMounted(() => {
      mql = window.matchMedia('(max-width: 767px)');
      isMobile.value = mql.matches;
      mql.addEventListener('change', onChange);
   });
   onUnmounted(() => {
      mql?.removeEventListener('change', onChange);
      mql = null;
   });

   return isMobile;
};
