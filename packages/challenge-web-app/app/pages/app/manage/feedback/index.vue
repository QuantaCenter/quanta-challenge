<script setup lang="ts">
import { Close, Inbox, Right, Search } from '@icon-park/vue-next';
import type { inferRouterOutputs } from '@trpc/server';
import { refDebounced } from '@vueuse/core';
import dayjs from 'dayjs';
import {
   type FeedbackStatus,
   type FeedbackStatusFilter,
   type FeedbackType,
   feedbackStatuses,
   feedbackTypeLabels,
} from '~/components/feedback/feedback-options';
import { useMessage } from '~/components/st/Message/use-message';
import { useFeedbackStore } from '~/stores/feedback-store';
import { logger } from '~~/lib/logger';
import type { AppRouter } from '~~/server/trpc/routes';

useSeoMeta({ title: '反馈管理 - Quanta Challenge' });

type RouterOutput = inferRouterOutputs<AppRouter>;
type Feedback = RouterOutput['admin']['feedback']['list']['items'][number];
type FeedbackDetail = RouterOutput['admin']['feedback']['detail'];

const { $trpc } = useNuxtApp();
const message = useMessage();

const status = ref<FeedbackStatusFilter>('pending');
const keyword = ref('');
const searchKeyword = refDebounced(keyword, 300);
const typeFilter = ref<'ALL' | FeedbackType>('ALL');
const nextStatus = ref<FeedbackStatus>('working');

const feedbackStore = useFeedbackStore();

const {
   items: feedbacks,
   status: listStatus,
   loadingMore,
   refresh,
   sentinelRef,
} = useInfiniteList<Feedback, number>({
   key: 'manage-feedbacks',
   pageSize: 20,
   fetchPage: (cursor, limit) =>
      $trpc.admin.feedback.list.query({
         keyword: searchKeyword.value.trim() || undefined,
         type: typeFilter.value === 'ALL' ? undefined : typeFilter.value,
         status: status.value === 'ALL' ? undefined : status.value,
         cursor,
         limit,
      }),
});

// 与「我的反馈」同因：useAsyncData 会复用缓存，回复后或跨页返回都要显式刷新
const seenVersion = useState('manage-feedback-seen-version', () => 0);

const refreshIfStale = async () => {
   if (feedbackStore.listVersion === seenVersion.value) return;
   await refresh();
   seenVersion.value = feedbackStore.listVersion;
};

onMounted(() => {
   void refreshIfStale();
});

watch([status, searchKeyword, typeFilter], () => {
   void refresh();
});

const formatTime = (time: Date | string) =>
   dayjs(time).format('YYYY-MM-DD HH:mm');

// 详情抽屉
const detailOpened = ref(false);
const detail = ref<FeedbackDetail | null>(null);
const detailLoading = ref(false);
let detailGeneration = 0;

const openDetail = async (id: number) => {
   const generation = ++detailGeneration;
   detailOpened.value = true;
   detailLoading.value = true;
   detail.value = null;
   replyText.value = '';
   nextStatus.value = 'working';
   try {
      const result = await $trpc.admin.feedback.detail.query({ id });
      if (generation !== detailGeneration) return;
      detail.value = result;
      nextStatus.value = result.status;
   } catch (error) {
      if (generation !== detailGeneration) return;
      logger.error(error, '加载反馈详情失败');
      message.error('加载失败', '请稍后重试');
      detailOpened.value = false;
   } finally {
      if (generation === detailGeneration) detailLoading.value = false;
   }
};

// 回复
const replyText = ref('');
const replying = ref(false);

const handleReply = async () => {
   if (!detail.value) return;
   if (!replyText.value.trim()) {
      message.warning('请填写回复内容');
      return;
   }
   replying.value = true;
   try {
      await $trpc.admin.feedback.reply.mutate({
         id: detail.value.id,
         reply: replyText.value.trim(),
         status: nextStatus.value,
         expectedUpdatedAt: new Date(detail.value.updatedAt).toISOString(),
      });
      message.success('处理结果已保存');
      replyText.value = '';
      detailOpened.value = false;
      // 状态变化同样影响用户侧列表
      feedbackStore.markListDirty();
      await refresh();
      seenVersion.value = feedbackStore.listVersion;
   } catch (error) {
      logger.error(error, '回复反馈失败');
      message.error('回复失败', '请稍后重试');
   } finally {
      replying.value = false;
   }
};
</script>

<template>
   <div class="h-full w-full overflow-y-auto">
      <main
         class="mx-auto w-full max-w-[68rem] px-8 pb-40 pt-10 max-md:px-4 max-md:pt-6"
      >
         <header class="mb-7 flex flex-wrap items-center justify-between gap-4">
            <h1 class="text-3xl font-semibold tracking-tight max-md:text-2xl">
               反馈管理
            </h1>
            <div class="relative w-72 max-md:w-full">
               <Search
                  class="pointer-events-none absolute left-3.5 top-3.5 text-accent-400"
               />
               <input
                  v-model="keyword"
                  aria-label="搜索反馈"
                  placeholder="搜索标题或编号"
                  class="w-full rounded-xl border border-accent-600 bg-accent-600/30 py-3 pl-10 pr-4 text-sm outline-none placeholder:text-accent-400 focus:border-primary/70"
               >
            </div>
         </header>

         <div
            class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-accent-600 pb-3"
         >
            <FeedbackStatusFilters v-model="status" />
            <select
               v-model="typeFilter"
               aria-label="反馈类型"
               class="cursor-pointer rounded-lg border border-accent-600 bg-background px-3 py-2 text-xs text-accent-200 outline-none focus:border-primary/70"
            >
               <option value="ALL">全部类型</option>
               <option
                  v-for="(label, value) in feedbackTypeLabels"
                  :key="value"
                  :value="value"
               >
                  {{ label }}
               </option>
            </select>
         </div>

         <div
            v-if="listStatus === 'error'"
            role="alert"
            class="mb-4 flex items-center justify-between rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-error"
         >
            加载失败<button
               type="button"
               class="cursor-pointer underline"
               @click="refresh()"
            >
               重试
            </button>
         </div>
         <div
            v-if="listStatus === 'pending' && !feedbacks.length"
            class="space-y-3"
         >
            <StSkeletonItem
               v-for="i in 4"
               :key="i"
               class="h-24 w-full rounded-xl"
            />
         </div>
         <div
            v-else-if="!feedbacks.length && listStatus !== 'error'"
            class="flex flex-col items-center gap-4 py-24 text-accent-300"
         >
            <Inbox class="text-4xl text-accent-400" />
            <p class="text-sm">暂无相关反馈</p>
         </div>
         <div
            v-else
            class="overflow-hidden rounded-2xl border border-accent-600 bg-accent-600/20"
         >
            <button
               v-for="feedback in feedbacks"
               :key="feedback.id"
               type="button"
               class="group flex w-full cursor-pointer items-center gap-4 border-b border-accent-600 px-5 py-5 text-left transition-colors last:border-0 hover:bg-accent-600/50 focus-visible:bg-accent-600/50 focus-visible:outline-none max-md:gap-3 max-md:px-4"
               @click="openDetail(feedback.id)"
            >
               <div class="min-w-0 flex-1">
                  <div
                     class="mb-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-accent-400"
                  >
                     <span>#{{ feedback.id }}</span><span>·</span
                     ><span>{{ feedbackTypeLabels[feedback.type] }}</span>
                  </div>
                  <h2
                     class="truncate text-base font-medium text-accent-100 transition-colors group-hover:text-white"
                  >
                     {{ feedback.title }}
                  </h2>
                  <p class="mt-2 truncate text-xs text-accent-400">
                     {{ feedback.author.displayName || feedback.author.name }} ·
                     <span>{{ formatTime(feedback.createdAt) }}</span>
                     <span v-if="feedback._count.attachments">
                        · {{ feedback._count.attachments }} 图
                     </span>
                  </p>
               </div>
               <FeedbackStatusBadge :status="feedback.status" />
               <Right class="text-sm text-accent-400 max-md:hidden" />
            </button>
         </div>
         <div
            :ref="(element) => { sentinelRef = element as HTMLElement | null; }"
            class="h-1"
         />
         <p v-if="loadingMore" class="py-4 text-center text-xs text-accent-400">
            加载中…
         </p>
      </main>

      <ClientOnly>
         <StDrawer global v-model:opened="detailOpened" width="35rem">
            <div
               class="flex h-full min-h-0 flex-col bg-background text-accent-100 max-md:rounded-t-2xl"
            >
               <header
                  class="flex shrink-0 items-center justify-between border-b border-accent-600 px-7 py-5 max-md:px-5 max-md:pt-7"
               >
                  <h1 class="text-xl font-semibold">
                     反馈详情
                     <span
                        v-if="detail"
                        class="ml-2 text-sm font-normal text-accent-400"
                        >#{{ detail.id }}</span
                     >
                  </h1>
                  <button
                     type="button"
                     aria-label="关闭详情"
                     class="flex size-8 cursor-pointer items-center justify-center rounded-lg text-accent-300 hover:bg-accent-600 hover:text-white"
                     @click="detailOpened = false"
                  >
                     <Close class="text-lg" />
                  </button>
               </header>

               <div
                  class="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-7 py-6 max-md:px-5"
               >
                  <StSkeletonItem
                     v-if="detailLoading"
                     class="h-48 w-full rounded-xl"
                  />
                  <template v-else-if="detail">
                     <section>
                        <div
                           class="mb-3 flex items-center justify-between gap-3"
                        >
                           <span class="text-xs text-accent-300">{{
                              feedbackTypeLabels[detail.type]
                           }}</span><FeedbackStatusBadge
                              :status="detail.status"
                           />
                        </div>
                        <h2 class="break-words text-xl font-medium leading-8">
                           {{ detail.title }}
                        </h2>
                        <p class="mt-2 text-xs text-accent-400">
                           {{
                              detail.author.displayName || detail.author.name
                           }} · {{ formatTime(detail.createdAt) }}
                        </p>
                        <p
                           class="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-accent-200"
                        >
                           {{ detail.description }}
                        </p>
                        <p
                           v-if="detail.baseProblem"
                           class="mt-3 text-xs text-accent-400"
                        >
                           关联题目 ·
                           {{
                              detail.baseProblem.CurrentProblem?.title ||
                                 `#${detail.baseProblemId}`
                           }}
                        </p>
                        <div
                           v-if="detail.attachments.length"
                           class="mt-4 flex flex-wrap gap-2.5"
                        >
                           <FeedbackScreenshot
                              v-for="image in detail.attachments"
                              :key="image.id"
                              :id="image.id"
                           />
                        </div>
                     </section>

                     <details
                        v-if="detail.events.length"
                        class="group border-t border-accent-600 pt-4"
                     >
                        <summary
                           class="flex cursor-pointer list-none items-center justify-between text-sm text-accent-300 hover:text-white [&::-webkit-details-marker]:hidden"
                        >
                           <span
                              >处理记录
                              <span class="ml-1 text-xs text-accent-400">{{
                                 detail.events.length
                              }}</span></span
                           ><span
                              class="text-lg leading-none transition-transform group-open:rotate-45"
                              aria-hidden="true"
                              >+</span
                           >
                        </summary>
                        <ol
                           class="mt-5 space-y-5 border-l border-accent-500 pl-4"
                        >
                           <li v-for="event in detail.events" :key="event.id">
                              <p class="text-xs leading-5 text-accent-400">
                                 {{ event.actorName }} ·
                                 {{ formatTime(event.createdAt) }} ·
                                 {{ feedbackStatuses[event.status].label }}
                              </p>
                              <p
                                 class="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-accent-200"
                              >
                                 {{ event.reply }}
                              </p>
                           </li>
                        </ol>
                     </details>

                     <section class="space-y-4 border-t border-accent-600 pt-5">
                        <div class="flex items-center justify-between gap-4">
                           <label
                              for="feedback-next-status"
                              class="text-sm font-medium"
                              >处理状态</label
                           ><select
                              id="feedback-next-status"
                              v-model="nextStatus"
                              class="rounded-lg border border-accent-600 bg-background px-3 py-2 text-sm outline-none focus:border-primary/70"
                           >
                              <option
                                 v-for="(option, value) in feedbackStatuses"
                                 :key="value"
                                 :value="value"
                              >
                                 {{ option.label }}
                              </option>
                           </select>
                        </div>
                        <div class="space-y-2">
                           <div class="flex items-center justify-between">
                              <label
                                 for="feedback-admin-reply"
                                 class="text-sm font-medium"
                                 >回复
                                 <span class="text-primary">*</span></label
                              ><span
                                 class="text-xs tabular-nums text-accent-400"
                                 >{{ replyText.length }}
                                 / 2000</span
                              >
                           </div>
                           <textarea
                              id="feedback-admin-reply"
                              v-model="replyText"
                              rows="5"
                              maxlength="2000"
                              placeholder="填写处理结果或需要补充的信息"
                              class="min-h-32 w-full resize-y rounded-xl border border-accent-600 bg-accent-600/30 px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-accent-400 focus:border-primary/70"
                           />
                        </div>
                     </section>
                  </template>
               </div>
               <footer
                  class="flex shrink-0 justify-end gap-3 border-t border-accent-600 px-7 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-md:px-5"
               >
                  <StButton
                     theme="secondary"
                     bordered
                     class="!rounded-lg !border-accent-500 !text-accent-200 px-5 py-2.5"
                     @click="detailOpened = false"
                     >取消</StButton
                  >
                  <StButton
                     :loading="replying"
                     :disabled="!detail || detailLoading || replying"
                     class="!rounded-lg px-6 py-2.5"
                     @click="handleReply"
                     >保存回复</StButton
                  >
               </footer>
            </div>
         </StDrawer>
      </ClientOnly>
   </div>
</template>
