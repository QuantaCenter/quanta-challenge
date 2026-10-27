import { useLearningVisits } from '~/composables/use-learning-visits';
import useAuthStore from '~/stores/auth-store';

/**
 * 学习进度的加载与**本地历史迁移**。
 *
 * 进度（访问 / 完成）的真源在服务端（表 `learning_visits` /
 * `learning_completions`）；"做过哪道题"由成功提交记录推导。
 * 这里在登录态就绪后拉一次：
 *
 *   1. 有本地历史（落库之前只存在浏览器里的记录）→ 先补写进服务端，再拉取；
 *   2. 否则直接拉取。
 *
 * 为什么放在客户端而不是 SSR 预取：这个接口要用户身份，Nitro 插件里得自己
 * 验签 cookie；而进度只影响卡片上的"已读 / 百分比"，晚一帧无伤大雅——
 * 内容本身仍然由 SSR 预取（首帧就是库里的内容）。
 */
export default defineNuxtPlugin(() => {
   if (import.meta.server) return;

   const visits = useLearningVisits();
   const authStore = useAuthStore();
   const { $trpc } = useNuxtApp();

   const pull = async () => {
      try {
         const progress = await $trpc.public.learningProgress.me.query();
         visits.hydrateFromServer(progress);
      } catch {
         // 未登录 / 接口不可用：用本地缓存兜底（load 只在不 hydrated 时生效）
         visits.load();
      }
   };

   /**
    * 客户端的同步顺序：
    *   1. SSR 已经预取过进度（`event.context.learningProgress` → payload）→ 直接灌；
    *   2. 有本地历史 → 先补写进服务端（一次性迁移）；
    *   3. 再拉一次，保证迁移结果立即生效。
    */
   const sync = async () => {
      if (!authStore.user) return;
      await visits.migrateLocalToServer();
      await pull();
   };

   onMounted(() => void sync());
   // 登录成功后（同一次会话内）也要补一次
   watch(() => authStore.user?.id, (id) => {
      if (id) void sync();
   });
});
