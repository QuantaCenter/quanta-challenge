import type { User } from '@prisma/client';
import type { TRPCClient } from '@trpc/client';
import { defineStore } from 'pinia';
import type { AppRouter } from '~~/server/trpc/routes';

const useAuthStore = defineStore('auth', () => {
   const user = ref<User | null>(null);

   // 在客户端立即从 localStorage 加载 CSRF token
   const csrfToken = ref<string | null>(
      import.meta.client && typeof localStorage !== 'undefined'
         ? localStorage.getItem('csrfToken')
         : null
   );

   const initToken = () => {
      if (import.meta.server) return;
      const token = localStorage.getItem('csrfToken');
      if (token) {
         csrfToken.value = token;
      }
   };

   const setCsrfToken = (token: string) => {
      csrfToken.value = token;
      if (import.meta.client) {
         localStorage.setItem('csrfToken', token);
      }
   };

   const fetchUserInfo = async (trpc: TRPCClient<AppRouter>) => {
      try {
         const result = await trpc.auth.login.getUser.query();
         if (result.user) {
            const rawUser = result.user;
            user.value = {
               ...transformObjectFields(
                  rawUser,
                  ['createdAt', 'updatedAt', 'lastLogin'],
                  (value: any) => new Date(value)
               ),
               // lastActiveAt 允许为空（迁移前的老用户从没记录过），不能跟着上面
               // 一起批量转换——transformObjectFields 会把 null 交给 new Date()
               // 变成 1970，"从未活跃"会显示成 1970-01-01。
               lastActiveAt: rawUser.lastActiveAt
                  ? new Date(rawUser.lastActiveAt)
                  : null,
            };
            return true;
         }
         return false;
      } catch (error) {
         console.error(error);
         return false;
      }
   };

   return {
      user,
      csrfToken,
      setCsrfToken,
      initToken,
      fetchUserInfo,
   };
});

export default useAuthStore;
