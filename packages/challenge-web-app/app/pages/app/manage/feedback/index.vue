<script setup lang="ts">
import {
   CheckOne,
   Close,
   Inbox,
   Left,
   Refresh,
} from '@icon-park/vue-next';
import dayjs from 'dayjs';
import { FocusScope } from 'reka-ui';
import { useMessage } from '~/components/st/Message/use-message';
import type { ITableColumn } from '~/components/st/Table/type';
import useAuthStore from '~/stores/auth-store';
import MemberPagination from '../member/_components/MemberPagination.vue';

useSeoMeta({ title: '用户反馈 - Quanta Challenge' });

const PAGE_SIZE = 20;
const categories = {
   bug: { label: '问题报告', color: '#ffbe31' },
   suggestion: { label: '功能建议', color: '#fa7c0e' },
   other: { label: '其他', color: '#434343' },
} as const;
const statuses = {
   new: { label: '待查看', color: '#434343' },
   reviewed: { label: '已查看', color: '#596576' },
   resolved: { label: '已处理', color: '#14e87e' },
} as const;
const statusOptions = [
   { label: '全部状态', value: 'all' },
   ...Object.entries(statuses).map(([value, { label }]) => ({ label, value })),
];
const categoryOptions = [
   { label: '全部类型', value: 'all' },
   ...Object.entries(categories).map(([value, { label }]) => ({ label, value })),
];
const columns: ITableColumn[] = [
   { key: 'description', title: '反馈内容', skeletonClass: 'h-5 w-3/4 rounded-md' },
   { key: 'reporter', title: '提交人', width: '8rem', class: 'max-md:hidden', skeletonClass: 'h-5 w-20 rounded-md' },
   { key: 'status', title: '状态', width: '6rem', class: 'max-md:hidden', skeletonClass: 'h-5 w-14 rounded-md' },
   { key: 'createdAt', title: '提交时间', width: '10rem', class: 'max-md:hidden' },
   { key: 'action', title: '操作', width: '6rem', align: 'right', skeletonClass: 'h-5 w-12 rounded-md' },
];

const authStore = useAuthStore();
const canViewFeedback = computed(() =>
   authStore.user?.role === 'ADMIN' || authStore.user?.role === 'SUPER_ADMIN'
);
const { $trpc } = useNuxtApp();
const message = useMessage();
const page = ref(1);
const status = ref<'all' | 'new' | 'reviewed' | 'resolved'>('all');
const category = ref<'all' | keyof typeof categories>('all');
const statusOpened = ref(false);
const categoryOpened = ref(false);
const reviewingId = ref<string | null>(null);
const resolvingId = ref<string | null>(null);
const resolutionDrafts = reactive<Record<string, string>>({});
const detailOpened = ref(false);
const detailTitle = useTemplateRef('feedback-detail-title');
let detailTrigger: HTMLElement | undefined;

watch([status, category], () => {
   page.value = 1;
}, { flush: 'sync' });

const { data, error, pending, refresh, status: loadStatus } = useAsyncData(
   'manage-feedback',
   (_, { signal }) => canViewFeedback.value
      ? $trpc.admin.feedback.list.query({
         page: page.value,
         pageSize: PAGE_SIZE,
         status: status.value === 'all' ? undefined : status.value,
         category: category.value === 'all' ? undefined : category.value,
      }, { signal })
      : Promise.resolve({ items: [], total: 0 }),
   { server: false, watch: [page, status, category, canViewFeedback] },
);

type Feedback = NonNullable<typeof data.value>['items'][number];
const selected = shallowRef<Feedback>();

const items = computed(() => data.value?.items ?? []);
const detail = computed(() => items.value.find(item => item.id === selected.value?.id) ?? selected.value);
const total = computed(() => data.value?.total ?? 0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));
const updating = computed(() => pending.value || Boolean(reviewingId.value || resolvingId.value));
const initialLoading = computed(() =>
   !data.value && (loadStatus.value === 'idle' || pending.value)
);
const formatTime = (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm');
const itemStatus = (item: Feedback) => statuses[item.resolvedAt ? 'resolved' : item.reviewedAt ? 'reviewed' : 'new'];

function openFilterFromKeyboard(filter: 'status' | 'category') {
   const opened = filter === 'status' ? statusOpened : categoryOpened;
   opened.value = true;
   void nextTick(() => document.querySelector<HTMLElement>(`[data-feedback-filter="${filter}"]`)?.focus());
}

function closeFilter(filter: 'status' | 'category') {
   const opened = filter === 'status' ? statusOpened : categoryOpened;
   opened.value = false;
   document.getElementById(`feedback-${filter}-filter`)?.focus();
}

function openDetail(item: Feedback) {
   detailTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
   selected.value = item;
   detailOpened.value = true;
}

function focusDetail(event: Event) {
   event.preventDefault();
   detailTitle.value?.focus({ preventScroll: true });
}

function restoreDetailFocus(event: Event) {
   event.preventDefault();
   const target = detailTrigger?.isConnected ? detailTrigger : document.getElementById('feedback-status-filter');
   target?.focus({ preventScroll: true });
}

watch(data, (result) => {
   if (result && page.value > totalPages.value) page.value = totalPages.value;
});

const markReviewed = async (item: Feedback) => {
   if (updating.value || item.reviewedAt) return;
   reviewingId.value = item.id;
   try {
      const { reviewedAt } = await $trpc.admin.feedback.markReviewed.mutate({ id: item.id });
      if (selected.value?.id === item.id) selected.value = { ...selected.value, reviewedAt };
      if (data.value) {
         data.value = {
            ...data.value,
            items: data.value.items.map(row => row.id === item.id ? { ...row, reviewedAt } : row),
         };
      }
      message.success('已标记为已查看');
      await refresh();
   } catch {
      message.error('标记失败', '请检查网络连接后重试');
   } finally {
      reviewingId.value = null;
   }
};

const shouldNotify = (item: Feedback) => Boolean(item.notifyOnResolve && item.user);

async function resolveFeedback(item: Feedback) {
   const resolution = resolutionDrafts[item.id]?.trim();
   if (updating.value || item.resolvedAt || (shouldNotify(item) && !resolution)) return;

   resolvingId.value = item.id;
   try {
      await $trpc.admin.feedback.resolve.mutate({ id: item.id, resolution });
      delete resolutionDrafts[item.id];
      detailOpened.value = false;
      message.success('已标记为已处理');
      await refresh();
   } catch {
      message.error('处理失败', '请稍后重试。');
   } finally {
      resolvingId.value = null;
   }
}
</script>

<template>
   <StSpace direction="vertical" gap="1.25rem" class="mx-auto w-full max-w-[64rem] px-4 pb-28 pt-5 md:px-8 md:pt-8">
      <NuxtLink
         to="/app/manage"
         class="inline-flex items-center gap-1 rounded text-sm text-accent-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-primary">
         <Left aria-hidden="true" />
         管理流程
      </NuxtLink>
      <StSpace fill-x align="center" justify="between" gap="0.75rem">
         <h1 class="st-font-hero-bold text-accent-100 max-md:text-[1.5rem] max-md:leading-tight">用户反馈</h1>
         <StButton
            v-if="canViewFeedback"
            size="sm"
            class="!gap-1.5 !rounded-lg !bg-accent-600 !px-3"
            :loading="pending"
            @click="refresh()">
            <Refresh aria-hidden="true" v-if="!pending" />
            刷新
         </StButton>
      </StSpace>

      <StEmptyStatus
         v-if="!canViewFeedback"
         content="仅管理员可查看用户反馈"
         :icon="Inbox"
         class="w-full rounded-xl border border-accent-600 py-20" />

      <template v-else>
         <StSpace fill-x align="center" justify="between" gap="0.75rem" wrap>
            <StSpace gap="0.5rem" align="center">
               <StSelect
                  id="feedback-status-filter"
                  v-model:opened="statusOpened"
                  :value="status"
                  :options="statusOptions"
                  attach-to-body
                  role="button"
                  tabindex="0"
                  :aria-expanded="statusOpened"
                  aria-label="按反馈状态筛选"
                  outer-class="h-10 w-28 bg-accent-600 !gap-1 !px-3 !py-0 text-sm"
                  options-container-class="!border-accent-500"
                  @keydown.enter.self.prevent="openFilterFromKeyboard('status')"
                  @keydown.space.self.prevent="openFilterFromKeyboard('status')"
                  @keydown.esc.stop="statusOpened = false"
                  @update:value="status = $event || 'all'">
                  <template #selected-preview>
                     <span class="text-white">{{ statusOptions.find(option => option.value === status)?.label }}</span>
                  </template>
                  <template #option="{ item }">
                     <button
                        type="button"
                        data-feedback-filter="status"
                        :tabindex="statusOpened ? 0 : -1"
                        :aria-hidden="!statusOpened"
                        class="block w-full whitespace-nowrap text-left text-sm"
                        @click="closeFilter('status')"
                        @keydown.esc.stop.prevent="closeFilter('status')">{{ item.label }}</button>
                  </template>
               </StSelect>
               <StSelect
                  id="feedback-category-filter"
                  v-model:opened="categoryOpened"
                  :value="category"
                  :options="categoryOptions"
                  attach-to-body
                  role="button"
                  tabindex="0"
                  :aria-expanded="categoryOpened"
                  aria-label="按反馈类型筛选"
                  outer-class="h-10 w-28 bg-accent-600 !gap-1 !px-3 !py-0 text-sm"
                  options-container-class="!border-accent-500"
                  @keydown.enter.self.prevent="openFilterFromKeyboard('category')"
                  @keydown.space.self.prevent="openFilterFromKeyboard('category')"
                  @keydown.esc.stop="categoryOpened = false"
                  @update:value="category = $event || 'all'">
                  <template #selected-preview>
                     <span class="text-white">{{ categoryOptions.find(option => option.value === category)?.label }}</span>
                  </template>
                  <template #option="{ item }">
                     <button
                        type="button"
                        data-feedback-filter="category"
                        :tabindex="categoryOpened ? 0 : -1"
                        :aria-hidden="!categoryOpened"
                        class="block w-full whitespace-nowrap text-left text-sm"
                        @click="closeFilter('category')"
                        @keydown.esc.stop.prevent="closeFilter('category')">{{ item.label }}</button>
                  </template>
               </StSelect>
            </StSpace>
            <span v-if="!error" role="status" class="st-font-caption rounded-full bg-accent-600 px-3 py-1 text-accent-300">
               {{ pending || initialLoading ? '正在加载…' : `共 ${total} 条反馈` }}
            </span>
         </StSpace>

         <StSpace
            v-if="error"
            role="alert"
            fill-x
            direction="vertical"
            align="center"
            gap="0.75rem"
            class="rounded-xl border border-accent-600 px-4 py-12 text-center">
            <p class="text-accent-100">暂时无法加载反馈</p>
            <p class="text-sm text-accent-300">请检查网络连接后重试。</p>
            <StButton size="sm" @click="refresh()">重新加载</StButton>
         </StSpace>
         <StTable
            v-else
            :columns="columns"
            :rows="items"
            :loading="initialLoading"
            :skeleton-count="4"
            :aria-busy="pending || initialLoading"
            row-key="id"
            clickable-rows
            @row-click="openDetail">
            <template #cell-description="{ row }">
               <StSpace direction="vertical" gap="0.375rem" class="min-w-0">
                  <StSpace align="center" gap="0.375rem" wrap>
                     <StTag size="small" :content="categories[row.category].label" :color="categories[row.category].color" contrast-text />
                     <StTag size="small" :content="itemStatus(row).label" :color="itemStatus(row).color" contrast-text class="md:hidden" />
                  </StSpace>
                  <p class="line-clamp-2 break-words text-sm text-accent-100">{{ row.description }}</p>
               </StSpace>
            </template>
            <template #cell-reporter="{ row }">
               <p class="truncate text-sm text-accent-200">{{ row.user?.displayName || row.user?.name || '访客' }}</p>
            </template>
            <template #cell-status="{ row }">
               <StTag size="small" :content="itemStatus(row).label" :color="itemStatus(row).color" contrast-text />
            </template>
            <template #cell-createdAt="{ row }">
               <time :datetime="row.createdAt" class="whitespace-nowrap text-sm text-accent-300">{{ formatTime(row.createdAt) }}</time>
            </template>
            <template #cell-action="{ row }">
               <StButton size="sm" class="ml-auto !rounded-lg !bg-accent-600 !px-2.5 !text-sm whitespace-nowrap" @click.stop="openDetail(row)">
                  详情
               </StButton>
            </template>
            <template #empty>
               <StEmptyStatus
                  :content="status === 'all' && category === 'all' ? '还没有收到用户反馈' : '没有符合当前筛选条件的反馈'"
                  :icon="Inbox" />
            </template>
         </StTable>

         <MemberPagination
            v-if="!error && totalPages > 1"
            v-model:page="page"
            :total="total"
            :total-pages="totalPages"
            :has-next-page="page < totalPages"
            :pending="pending" />
      </template>

      <StDrawer v-slot="{ rendered }" v-model:opened="detailOpened" global width="min(42rem, 90vw)" panel-class="overflow-hidden">
         <FocusScope
            v-if="rendered && detail"
            :trapped="detailOpened"
            loop
            as-child
            @mount-auto-focus="focusDetail"
            @unmount-auto-focus="restoreDetailFocus">
            <div
               role="dialog"
               aria-labelledby="feedback-detail-title"
               :aria-modal="detailOpened ? 'true' : undefined"
               :inert="!detailOpened"
               class="flex h-full flex-col overflow-hidden bg-background max-md:pt-3"
               @keydown.esc.stop="detailOpened = false">
               <StSpace fill-x justify="between" align="start" gap="1rem" class="shrink-0 px-5 py-5 md:px-8 md:py-6">
                  <StSpace direction="vertical" gap="0.5rem">
                     <h2 id="feedback-detail-title" ref="feedback-detail-title" tabindex="-1" class="st-font-third-bold outline-none">反馈详情</h2>
                     <StSpace gap="0.5rem" align="center" wrap>
                        <StTag size="small" :content="categories[detail.category].label" :color="categories[detail.category].color" contrast-text />
                        <StTag size="small" :content="itemStatus(detail).label" :color="itemStatus(detail).color" contrast-text />
                        <time :datetime="detail.createdAt" class="text-xs text-accent-300">{{ formatTime(detail.createdAt) }}</time>
                     </StSpace>
                  </StSpace>
                  <StButton size="sm" aria-label="关闭反馈详情" class="!size-9 !shrink-0 !rounded-lg !bg-accent-600 !p-0" @click="detailOpened = false">
                     <Close aria-hidden="true" class="text-lg" />
                  </StButton>
               </StSpace>
               <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 md:px-8">
                  <h2 class="text-sm font-bold text-accent-100">反馈内容</h2>
                  <p class="st-selectable mt-2 whitespace-pre-wrap text-sm leading-relaxed break-words text-accent-100">
                     {{ detail.description }}
                  </p>

                  <dl class="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-background/85 p-3 text-sm sm:grid-cols-2 md:p-4">
                     <div v-if="detail.user?.name" class="min-w-0">
                        <dt class="text-xs text-accent-300">账号</dt>
                        <dd class="st-selectable mt-1 break-words text-accent-100">{{ detail.user.name }}</dd>
                     </div>
                     <div v-if="detail.contact" class="min-w-0">
                        <dt class="text-xs text-accent-300">联系邮箱</dt>
                        <dd class="st-selectable mt-1 break-words text-accent-100">{{ detail.contact }}</dd>
                     </div>
                     <div v-if="shouldNotify(detail) || detail.resolution" class="min-w-0">
                        <dt class="text-xs text-accent-300">站内通知</dt>
                        <dd class="mt-1 text-accent-100">{{ detail.resolution ? '已发送处理结果' : '处理完成后通知用户' }}</dd>
                     </div>
                     <div v-if="detail.pagePath" class="min-w-0">
                        <dt class="text-xs text-accent-300">相关页面</dt>
                        <dd class="st-selectable mt-1 break-all text-accent-100">{{ detail.pagePath }}</dd>
                     </div>
                     <div v-if="detail.traceId" class="min-w-0">
                        <dt class="text-xs text-accent-300">错误编号</dt>
                        <dd class="st-selectable mt-1 break-all text-accent-100">{{ detail.traceId }}</dd>
                     </div>
                     <div class="min-w-0">
                        <dt class="text-xs text-accent-300">反馈编号</dt>
                        <dd class="st-selectable mt-1 break-all text-accent-100">{{ detail.id }}</dd>
                     </div>
                  </dl>

                  <div v-if="detail.resolution" class="mt-4">
                     <h2 class="text-sm font-bold text-accent-100">处理结果</h2>
                     <p class="st-selectable mt-2 whitespace-pre-wrap break-words text-sm text-accent-100">{{ detail.resolution }}</p>
                  </div>
                  <div v-if="!detail.resolvedAt && shouldNotify(detail)" class="mt-4">
                     <p :id="`feedback-resolution-${detail.id}`" class="mb-2 text-sm font-semibold text-accent-100">处理结果</p>
                     <StTextarea
                        v-model:value="resolutionDrafts[detail.id]"
                        :aria-labelledby="`feedback-resolution-${detail.id}`"
                        :disabled="resolvingId === detail.id"
                        :maxlength="1000"
                        rows="3"
                        placeholder="说明处理结果，完成后会发送到用户的通知中心"
                        outer-class="!px-3 !py-2.5 border border-accent-500 bg-background focus-within:border-primary"
                        class="min-w-0 resize-y text-sm" />
                  </div>
               </div>
               <StSpace fill-x justify="end" align="center" wrap gap="0.75rem" class="shrink-0 border-t border-accent-600 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-8 md:pt-4 md:pb-4">
                  <time v-if="detail.resolvedAt" :datetime="detail.resolvedAt" class="text-xs text-accent-300">处理于 {{ formatTime(detail.resolvedAt) }}</time>
                  <time v-else-if="detail.reviewedAt" :datetime="detail.reviewedAt" class="text-xs text-accent-300">查看于 {{ formatTime(detail.reviewedAt) }}</time>
                  <StButton
                     v-else
                     size="sm"
                     class="!gap-1.5 !rounded-lg !bg-accent-600"
                     :loading="reviewingId === detail.id"
                     :disabled="updating && reviewingId !== detail.id"
                     @click="markReviewed(detail)">
                     <CheckOne v-if="reviewingId !== detail.id" aria-hidden="true" />
                     标记为已查看
                  </StButton>
                  <StButton
                     v-if="!detail.resolvedAt"
                     size="sm"
                     class="!rounded-lg"
                     :loading="resolvingId === detail.id"
                     :disabled="(updating && resolvingId !== detail.id) || (shouldNotify(detail) && !resolutionDrafts[detail.id]?.trim())"
                     @click="resolveFeedback(detail)">
                     {{ shouldNotify(detail) ? '完成并通知用户' : '标记为已处理' }}
                  </StButton>
               </StSpace>
            </div>
         </FocusScope>
      </StDrawer>
   </StSpace>
</template>
