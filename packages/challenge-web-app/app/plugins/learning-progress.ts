import { useLearningVisits } from '~/composables/use-learning-visits';
import useAuthStore from '~/stores/auth-store';

/** 学习进度的客户端同步：登录态就绪后先迁移本地历史再拉取服务端进度 */
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
         // 未登录 / 接口不可用：用本地缓存兜底
         visits.load();
      }
   };

   /** 先迁移本地历史，再拉一次服务端进度 */
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
