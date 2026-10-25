<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import NotificationItem from './_components/NotificationItem.vue';
import NotificationDetailDrawer from './_components/NotificationDetailDrawer.vue';
import NotificationItemSkeleton from './_components/NotificationItemSkeleton.vue';
import { DoneAll, Inbox, LoadingFour, Ghost } from '@icon-park/vue-next';
import { useNuxtApp } from '#app';
import { useMessage } from '~/components/st/Message/use-message';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '~~/server/trpc/routes';

useSeoMeta({ title: '通知中心 - Quanta Challenge' });

type RouterOutput = inferRouterOutputs<AppRouter>;
type Notification =
   RouterOutput['protected']['notification']['list']['items'][number];

const { $trpc } = useNuxtApp();

type FilterType =
   | 'ALL'
   | 'UNREAD'
   | 'SYSTEM'
   | 'JUDGE'
   | 'COMMENT'
   | 'LIKE'
   | 'ACHIEVEMENT'
   | 'ANNOUNCEMENT'
   | 'WARNING';

const filterOptions: { label: string; value: FilterType; color: string }[] = [
   { label: '全部', value: 'ALL', color: '#FA7C0E' },
   { label: '未读', value: 'UNREAD', color: '#F59E0B' },
   { label: '系统', value: 'SYSTEM', color: '#3B82F6' },
   { label: '判题', value: 'JUDGE', color: '#10B981' },
   { label: '公告', value: 'ANNOUNCEMENT', color: '#8B5CF6' },
   { label: '警告', value: 'WARNING', color: '#EF4444' },
];

const route = useRoute();
const queryFilter = () =>
   filterOptions.find((option) => option.value === route.query.type)?.value;

const filterType = ref<FilterType>(queryFilter() ?? 'ALL');

// 路由 query 变化时同步筛选
watch(
   () => route.query.type,
   () => {
      const next = queryFilter();
      if (next) filterType.value = next;
   },
);

// 游标分页 + 触底加载，见 ~/composables/use-infinite-list.ts
const {
   items: notifications,
   status: notificationsStatus,
   loadingMore,
   allLoaded,
   refresh: refreshNotifications,
   sentinelRef,
} = useInfiniteList<Notification, string>({
   key: 'notifications',
   pageSize: 20,
   fetchPage: (cursor, limit) =>
      $trpc.protected.notification.list.query({
         type: filterType.value,
         cursor,
         limit,
      }),
});

// 刷新列表：强制进入骨架屏并至少展示 500ms，避免切换筛选时闪屏
// （refresh 期间旧列表仍挂在 items 上，骨架屏条件 pending && 空列表不会命中，需本地状态兜底）
const refreshing = ref(false);
const reloadNotifications = async () => {
   refreshing.value = true;
   try {
      await atLeastTime(500, refreshNotifications());
   } finally {
      refreshing.value = false;
   }
};

// 筛选条件变化时从第一页重新加载（fetchPage 内部实时读取 filterType）
watch(filterType, () => {
   void reloadNotifications();
});

// 收到新通知推送（SSE）时自动刷新列表
const notificationNewSignal = useState('notification-new-signal', () => 0);
watch(notificationNewSignal, () => {
   void reloadNotifications();
});

const unread = useUnreadNotifications();
const message = useMessage();

const markingAll = ref(false);
const markAllAsRead = async () => {
   if (markingAll.value) return;
   const unreadItems = notifications.value.filter((n) => !n.read);

   markingAll.value = true;
   unreadItems.forEach((n) => (n.read = true));
   unread.markAllRead();
   try {
      await $trpc.protected.notification.markAllAsRead.mutate();
   } catch (error) {
      console.error('Failed to mark all as read:', error);
      unreadItems.forEach((n) => (n.read = false));
      message.error('操作失败', '标记全部已读失败，请稍后重试');
   } finally {
      markingAll.value = false;
      await unread.refresh();
   }
};

const selectedNotification = ref<Notification | null>(null);
const isModalOpened = ref(false);

const openNotification = async (notification: Notification) => {
   selectedNotification.value = notification;
   isModalOpened.value = true;

   if (notification.read) return;

   notification.read = true;
   unread.markOneRead(notification.type === 'WARNING');
   try {
      await $trpc.protected.notification.markAsRead.mutate({
         id: notification.id,
      });
   } catch (error) {
      console.error('Failed to mark as read:', error);
      notification.read = false;
   } finally {
      await unread.refresh();
   }
};

const handleAppealed = (
   id: string,
   appeal: NonNullable<Notification['appeal']>,
) => {
   const target = notifications.value.find((n: Notification) => n.id === id);
   if (target) target.appeal = appeal;
};

const currentIndex = computed(() => {
   if (!selectedNotification.value) return -1;
   return notifications.value.findIndex(
      (n: Notification) => n.id === selectedNotification.value?.id,
   );
});

const hasPrevious = computed(() => currentIndex.value > 0);
const hasNext = computed(
   () =>
      currentIndex.value !== -1 &&
      currentIndex.value < notifications.value.length - 1,
);

const handlePrev = () => {
   if (hasPrevious.value) {
      const prev = notifications.value[currentIndex.value - 1];
      if (prev) {
         openNotification(prev);
      }
   }
};

const handleNext = () => {
   if (hasNext.value) {
      const next = notifications.value[currentIndex.value + 1];
      if (next) {
         openNotification(next);
      }
   }
};
</script>

<template>
   <StSpace direction="vertical" align="center" gap="0" class="w-full">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         fill
         class="px-4 py-6 max-w-[50rem] w-full shrink-0">
         <div class="flex justify-between items-end w-full">
            <h1 class="st-font-hero-bold max-md:text-[1.5rem] max-md:leading-[1.2]">通知中心</h1>
            <div
               v-if="unread.unreadCount.value > 0"
               @click="markAllAsRead"
               class="flex items-center gap-1.5 text-accent-400 hover:text-accent-100 cursor-pointer transition-colors select-none">
               <DoneAll size="1.125rem" />
               <span class="st-font-body-normal">全部已读</span>
            </div>
         </div>

         <div class="w-full">
            <StSlideRadioGroup
               :options="filterOptions"
               v-model:value="filterType" />
         </div>

         <StSpace direction="vertical" gap="1rem" fill class="w-full">
            <NotificationItemSkeleton
               v-if="refreshing || (notificationsStatus === 'pending' && notifications.length === 0)"
               v-for="i in 5"
               :key="i" />

            <template v-else>
               <NotificationItem
                  v-for="item in notifications"
                  :key="item.id"
                  :id="item.id"
                  :type="item.type"
                  :title="item.title"
                  :content="item.content"
                  :time="item.createdAt.toLocaleString()"
                  :read="item.read"
                  @click="openNotification(item)" />

               <StEmptyStatus
                  v-if="notifications.length === 0"
                  content="暂无通知"
                  :icon="Inbox"
                  class="opacity-60 py-20" />
            </template>

            <!-- 底部提示：加载中 / 没有更多 -->
            <div
               v-if="notifications.length > 0"
               class="shrink-0 w-full h-[3.5rem] flex items-center justify-center gap-2 text-sm text-accent-400">
               <template v-if="loadingMore">
                  <LoadingFour
                     class="animate-spin -translate-x-4"
                     theme="outline"
                     size="0.875rem" />
                  <span>加载中...</span>
               </template>
               <StSpace
                  v-else-if="allLoaded"
                  align="center"
                  gap="0.4em"
                  class="-translate-x-4 max-md:translate-x-0">
                  <Ghost theme="outline" size="1rem" />
                  没有更多通知了～
               </StSpace>
            </div>
            <!-- 触底加载哨兵 -->
            <div ref="sentinelRef" class="shrink-0 w-full h-[1px]"></div>
         </StSpace>
      </StSpace>

      <NotificationDetailDrawer
         v-model:opened="isModalOpened"
         :notification="selectedNotification"
         :has-previous="hasPrevious"
         :has-next="hasNext"
         @prev="handlePrev"
         @next="handleNext"
         @appealed="handleAppealed" />
   </StSpace>
</template>
