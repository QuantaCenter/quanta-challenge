import type { Router } from 'vue-router';

/**
 * 提交之后「回上一页」的统一口径。
 *
 * 直接 `router.back()` 有两个坑：
 *   1. 表单是从书签 / 新标签页直接打开的时，history 里没有上一个站内页面，
 *      退回会离开应用（甚至露出空白页）；
 *   2. 站外跳进来的情况下同样没有「上一页」。
 *
 * Vue Router 会在站内跳转时把 `history.state.back` 写成上一个路由，
 * 拿它判断比数 `history.length` 可靠得多。没有站内来源时退到一个明确的兜底页面。
 */
export const goBackOr = async (
   router: Router,
   fallback: string,
): Promise<void> => {
   if (!import.meta.client) return;

   const state = window.history.state as { back?: string | null } | null;
   if (state?.back) {
      router.back();
      return;
   }
   await router.push(fallback);
};
