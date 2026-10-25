<script setup lang="ts">
import { Remind, Search, TableReport } from '@icon-park/vue-next';
import {
   useMessage,
   useMessageOutsideVue,
} from '~/components/st/Message/use-message';
import useAuthStore from '~/stores/auth-store';
import UnreadWarningNotice from '~/components/notification/UnreadWarningNotice.vue';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role !== 'USER');

const username = computed(
   () => authStore.user?.displayName || authStore.user?.name || '用户'
);

const avatarUrl = computed(() => {
   // 必须用数据库里的文件名（avatar.name = `<uuid>.<ext>`），不能拿 imageId 硬拼 .jpg。
   // 实际文件是 .png/.webp，硬拼 .jpg 会 404，头像一直是坏的。
   const user = authStore.user as
      | (typeof authStore.user & { avatar?: { name?: string } | null })
      | null;
   const name = user?.avatar?.name;
   if (name) return `/api/static/${name}`;
   return user?.imageId ? `/api/static/${user.imageId}` : '';
});

const description = computed(() => {
   return isAdmin.value ? '管理员' : '普通用户';
});

const handleMyPublish = () => {
   navigateTo('/app/publish/problem/mine');
};

// 搜索功能
const { openSearch } = useSearch();

const handleSearchClick = () => {
   openSearch();
};

const handleNotificationClick = () => {
   navigateTo('/app/notifications');
};

const {
   unreadCount,
   unreadWarningCount,
   refresh: fetchUnreadCount,
} = useUnreadNotifications();

watch(() => authStore.user, fetchUnreadCount);

// 全局快捷键 Cmd/Ctrl + K
const handleKeydown = (e: KeyboardEvent) => {
   if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openSearch();
   }
};

onMounted(() => {
   fetchUnreadCount();
   window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
   window.removeEventListener('keydown', handleKeydown);
});

onMounted(() => {
   const message = useMessageOutsideVue();
   const { event } = useSSE<{ message: string }>({
      url: '/api/sse/notifications',
   });
   watch(event, (e) => {
      if (e && e.message === 'new_notification') {
         // 递增全局信号，通知中心等页面监听后自动刷新列表
         notificationNewSignal.value++;
         message.info('您有一条新的通知', void 0, {
            duration: 0,
         });
         fetchUnreadCount();
      }
   });
});

/** 新通知到达信号：SSE 推送触发，跨组件共享 */
const notificationNewSignal = useState('notification-new-signal', () => 0);

// 移动端导航抽屉（< 768px 时由移动端顶栏展开）
const mobileDrawerOpen = ref(false);
</script>

<template>
   <div class="w-full flex md:min-w-[1440px]">
      <StSidebar
         class="w-[9.3125rem] !fixed left-0 top-0 h-screen max-md:hidden" />
      <div class="w-[9.3125rem] max-md:hidden"></div>
      <main class="flex flex-col flex-1 min-w-0 pb-24 md:pb-0">
         <StHeader
            mode="gradient"
            class="fixed top-0 !w-[calc(100vw-9.3125rem)] !min-w-[calc(1440px-9.3125rem)] max-md:!hidden">
            <template #left>
               <StSpace gap="0.75rem" align="center">
                  <StHeaderButton text="搜索" @click="handleSearchClick">
                     <Search class="text-[1.25rem]" />
                  </StHeaderButton>
                  <StHeaderButton text="通知" @click="handleNotificationClick">
                     <div class="relative">
                        <Remind class="text-[1.25rem]" />
                        <div
                           v-if="unreadCount > 0"
                           class="absolute -top-1.5 -right-1.5 min-w-[1rem] h-4 px-[0.25rem] flex items-center justify-center bg-rose-500 text-white text-[0.625rem] font-bold rounded-full shadow-sm border-2 border-accent-600 z-10 pointer-events-none select-none leading-none font-family-manrope">
                           {{ unreadCount > 99 ? '99+' : unreadCount }}
                        </div>
                     </div>
                  </StHeaderButton>
                  <StHeaderButton
                     v-if="isAdmin"
                     @click="handleMyPublish"
                     text="我的发布">
                     <TableReport class="text-[1.25rem]" />
                  </StHeaderButton>
               </StSpace>
            </template>
            <template #right>
               <StHeaderProfile
                  :name="username"
                  :desc="description"
                  :url="avatarUrl" />
            </template>
         </StHeader>

         <div class="h-14 md:h-[5.75rem]"></div>
         <slot></slot>
      </main>

      <!-- 移动端导航（< 768px） -->
      <StMobileHeader @open-drawer="mobileDrawerOpen = true" />
      <StMobileNavDrawer v-model:open="mobileDrawerOpen" />
      <StMobileBottomNav />

      <StPageLoading />

      <!-- 搜索覆盖层 -->
      <StSearchOverlay />

      <!-- 对话框覆盖层 -->
      <DialogOverlay />

      <UnreadWarningNotice :count="unreadWarningCount" />
   </div>
</template>

<style lang="css" scoped>
.top-mask {
   background: linear-gradient(0deg, #11111100 0%, #111111 94.71%);
}
</style>
