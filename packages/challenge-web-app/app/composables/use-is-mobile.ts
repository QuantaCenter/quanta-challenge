/**
 * 移动端判定（断点与 Tailwind max-md: 一致：<768px）。
 *
 * 刻意不在 SSR / 客户端首次渲染期间读取真实断点：
 * useMediaQuery 在客户端 setup 阶段就会求值，导致「SSR 恒为 false、
 * 客户端首帧为真实值」的水合不一致（hydration mismatch），
 * Vue 会丢弃并重建整棵子树——表现为页面加载时面板闪一下。
 *
 * 这里保证 SSR 与客户端首帧恒为 false，mounted 后才同步真实值并跟随变化。
 * 因此该标记只可用于 v-if 等渲染分支，且首帧内容需与"移动端不可见"兼容。
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
