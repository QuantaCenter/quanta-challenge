<script setup lang="ts">
import { Caution, CheckOne, CloseOne, Inbox } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import { useMessage } from '~/components/st/Message/use-message';
import { dialog } from '~/composables/use-dialog';
import { logger } from '~~/lib/logger';
import MemberPagination from '../member/_components/MemberPagination.vue';

useSeoMeta({ title: '全部申诉 - Quanta Challenge' });

const PAGE_SIZE = 20;

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

const statusOptions: { label: string; value: StatusFilter; color: string }[] =
   [
      { label: '待处理', value: 'PENDING', color: '#F59E0B' },
      { label: '已通过', value: 'APPROVED', color: '#10B981' },
      { label: '已驳回', value: 'REJECTED', color: '#EF4444' },
      { label: '全部', value: 'ALL', color: '#FA7C0E' },
   ];

const STATUS_BADGE = {
   PENDING: { label: '待处理', class: 'bg-warning/20 text-warning' },
   APPROVED: { label: '已通过', class: 'bg-success/20 text-success' },
   REJECTED: { label: '已驳回', class: 'bg-error/20 text-error' },
} as const;

const { $trpc } = useNuxtApp();
const message = useMessage();
const page = ref(1);
const status = ref<StatusFilter>('PENDING');

watch(status, () => {
   page.value = 1;
});

const { data, pending, error, refresh } = useAsyncData(
   'manage-appeals',
   () =>
      atLeastTime(
         500,
         $trpc.admin.appeal.list.query({
            status: status.value === 'ALL' ? undefined : status.value,
            page: page.value,
            pageSize: PAGE_SIZE,
         }),
      ),
   { watch: [page, status] },
);

watch(
   error,
   (newError) => {
      if (newError) {
         logger.error(newError, '加载申诉失败');
         message.error('申诉加载失败', '请检查网络连接或稍后重试');
      }
   },
   { immediate: true },
);

type Appeal = NonNullable<typeof data.value>['appeals'][number];

const appeals = computed(() => data.value?.appeals ?? []);
const total = computed(() => data.value?.total ?? 0);
const totalPages = computed(() =>
   Math.max(1, Math.ceil(total.value / PAGE_SIZE)),
);
const formatTime = (time: Date | string) =>
   dayjs(time).format('YYYY-MM-DD HH:mm');

const handlingId = ref<string | null>(null);

const handleAppeal = async (appeal: Appeal, approve: boolean) => {
   const penalty = appeal.notification.scorePenalty;
   const userLabel = appeal.user.displayName || appeal.user.name;
   const confirmed = await dialog.confirm({
      title: approve ? '通过申诉' : '驳回申诉',
      description: approve
         ? `确认通过 ${userLabel} 的申诉？${
              penalty && !penalty.revokedAt
                 ? `将恢复其被扣除的 ${penalty.score} 分。`
                 : ''
           }`
         : `确认驳回 ${userLabel} 的申诉？警告与扣分将维持不变。`,
      variant: approve ? 'default' : 'danger',
      confirmText: approve ? '通过' : '驳回',
      cancelText: '取消',
   });
   if (!confirmed) return;

   handlingId.value = appeal.id;
   try {
      const { restoredScore } = await $trpc.admin.appeal.handle.mutate({
         id: appeal.id,
         decision: approve ? 'APPROVE' : 'REJECT',
      });
      message.success(
         approve ? '申诉已通过' : '申诉已驳回',
         restoredScore > 0 ? `已恢复 ${restoredScore} 分` : undefined,
      );
      await refresh();
   } catch (err) {
      logger.error(err, '处理申诉失败');
      message.error(
         '处理失败',
         err instanceof Error ? err.message : '请稍后重试',
      );
   } finally {
      handlingId.value = null;
   }
};
</script>

<template>
   <StSpace fill justify="center">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-full max-w-[50rem] pb-[10rem] my-6">
         <StSpace align="end" gap="1rem">
            <h1 class="st-font-hero-bold text-accent-100">全部申诉</h1>
            <span
               class="st-font-caption text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full">
               共 {{ total }} 条申诉
            </span>
         </StSpace>

         <div class="w-full">
            <StSlideRadioGroup
               :options="statusOptions"
               v-model:value="status" />
         </div>

         <StSpace direction="vertical" gap="1rem" fill-x>
            <template v-if="pending && appeals.length === 0">
               <StSkeletonItem
                  v-for="i in 4"
                  :key="i"
                  class="w-full h-[9rem] rounded-lg" />
            </template>

            <template v-else>
               <div
                  v-for="appeal in appeals"
                  :key="appeal.id"
                  class="w-full p-5 rounded-lg border border-accent-600 bg-accent-700/30 flex flex-col gap-4">
                  <div class="flex items-center justify-between gap-4">
                     <div class="flex items-center gap-3 min-w-0">
                        <StAvatar
                           :url="appeal.user.avatarUrl ?? undefined"
                           size="2.25rem"
                           class="shrink-0" />
                        <div class="min-w-0">
                           <div class="st-font-body-bold text-white truncate">
                              {{ appeal.user.displayName || appeal.user.name }}
                           </div>
                           <div
                              class="st-font-caption text-accent-400 truncate">
                              @{{ appeal.user.name }}
                           </div>
                        </div>
                     </div>
                     <div class="flex items-center gap-3 shrink-0">
                        <span
                           class="px-2 py-0.5 rounded st-font-caption"
                           :class="STATUS_BADGE[appeal.status].class">
                           {{ STATUS_BADGE[appeal.status].label }}
                        </span>
                        <span
                           class="st-font-caption text-accent-400 whitespace-nowrap">
                           {{ formatTime(appeal.createdAt) }}
                        </span>
                     </div>
                  </div>

                  <div
                     class="rounded-md border border-error/40 bg-error/10 px-4 py-3 flex flex-col gap-1">
                     <div
                        class="flex items-center justify-between gap-2 st-font-caption text-error">
                        <span class="flex items-center gap-1.5">
                           <Caution />
                           被申诉警告 ·
                           {{ formatTime(appeal.notification.createdAt) }}
                        </span>
                        <span
                           v-if="appeal.notification.scorePenalty"
                           :class="
                              appeal.notification.scorePenalty.revokedAt
                                 ? 'text-success'
                                 : 'text-error'
                           ">
                           {{
                              appeal.notification.scorePenalty.revokedAt
                                 ? `已恢复 ${appeal.notification.scorePenalty.score} 分`
                                 : `扣除 ${appeal.notification.scorePenalty.score} 分`
                           }}
                        </span>
                     </div>
                     <div class="st-font-body-bold text-accent-100">
                        {{ appeal.notification.title }}
                     </div>
                     <p
                        class="st-font-caption text-accent-300 line-clamp-2 whitespace-pre-wrap">
                        {{ appeal.notification.content }}
                     </p>
                  </div>

                  <p
                     class="st-font-body-normal text-accent-200 whitespace-pre-wrap break-words">
                     {{ appeal.content }}
                  </p>

                  <div
                     v-if="appeal.status === 'PENDING'"
                     class="flex justify-end gap-3">
                     <StButton
                        size="sm"
                        theme="danger"
                        bordered
                        :disabled="handlingId === appeal.id"
                        @click="handleAppeal(appeal, false)">
                        <span class="flex items-center gap-1">
                           <CloseOne />
                           驳回
                        </span>
                     </StButton>
                     <StButton
                        size="sm"
                        theme="success"
                        :loading="handlingId === appeal.id"
                        @click="handleAppeal(appeal, true)">
                        <span class="flex items-center gap-1">
                           <CheckOne />
                           {{
                              appeal.notification.scorePenalty &&
                              !appeal.notification.scorePenalty.revokedAt
                                 ? '通过并恢复分数'
                                 : '通过'
                           }}
                        </span>
                     </StButton>
                  </div>
                  <div
                     v-else-if="appeal.handledAt"
                     class="st-font-caption text-accent-400 text-right">
                     处理于 {{ formatTime(appeal.handledAt) }}
                  </div>
               </div>

               <StEmptyStatus
                  v-if="appeals.length === 0"
                  content="暂无申诉"
                  :icon="Inbox"
                  class="opacity-60 py-20" />
            </template>
         </StSpace>

         <MemberPagination
            v-model:page="page"
            :total="total"
            :total-pages="totalPages" />
      </StSpace>
   </StSpace>
</template>
