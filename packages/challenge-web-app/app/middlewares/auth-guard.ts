import useAuthStore from '~/stores/auth-store';

export default defineNuxtRouteMiddleware(async (to) => {
   if (to.path === '/auth/login') {
      return;
   }

   const authStore = useAuthStore();
   const { $trpc, $ensureFreshToken } = useNuxtApp();

   // 滑动续签：导航发起业务请求前先确保 access token 未临近过期（临近才真正调 /api/refresh）。
   // 续签成功则全程静默（浏览器不会打出 401 网络报错）；续签失败时 /api/refresh 的 401
   // 会出现在控制台，随后真实请求 401 走 handleUnauthorized 兜底跳转登录页。
   if (import.meta.client) {
      await $ensureFreshToken();
   }

   // 确保 CSRF token 已从 localStorage 加载
   if (import.meta.client && !authStore.csrfToken) {
      authStore.initToken();
   }

   if (!(await authStore.fetchUserInfo($trpc))) {
      // 带 redirect 参数，登录成功后由登录页的 safeRedirect 回跳原页面
      return navigateTo(
         '/auth/login?redirect=' + encodeURIComponent(to.fullPath)
      );
   }
});
