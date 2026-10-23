import useAuthStore from '~/stores/auth-store';

/** 未读通知计数（跨组件共享） */
export const useUnreadNotifications = () => {
   const unreadCount = useState('notification-unread-count', () => 0);
   const unreadWarningCount = useState(
      'notification-unread-warning-count',
      () => 0,
   );

   const { $trpc } = useNuxtApp();
   const authStore = useAuthStore();

   let refreshSeq = 0;
   const refresh = async () => {
      const seq = ++refreshSeq;
      if (!authStore.user) {
         unreadCount.value = 0;
         unreadWarningCount.value = 0;
         return;
      }
      try {
         const [count, warningCount] = await Promise.all([
            $trpc.protected.notification.unreadCount.query(),
            $trpc.protected.notification.unreadWarningCount.query(),
         ]);
         // 忽略过期响应
         if (seq !== refreshSeq) return;
         unreadCount.value = count;
         unreadWarningCount.value = warningCount;
      } catch {}
   };

   /** 标记单条已读（乐观） */
   const markOneRead = (isWarning: boolean) => {
      unreadCount.value = Math.max(0, unreadCount.value - 1);
      if (isWarning) {
         unreadWarningCount.value = Math.max(0, unreadWarningCount.value - 1);
      }
   };

   const markAllRead = () => {
      unreadCount.value = 0;
      unreadWarningCount.value = 0;
   };

   return {
      unreadCount,
      unreadWarningCount,
      refresh,
      markOneRead,
      markAllRead,
   };
};
