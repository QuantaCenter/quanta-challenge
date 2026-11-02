<script setup lang="ts">
import { Comment, Inbox, Plus } from '@icon-park/vue-next';
import type { inferRouterOutputs } from '@trpc/server';
import dayjs from 'dayjs';
import {
   type FeedbackStatusFilter,
   feedbackStatuses,
   feedbackTypeLabels,
} from '~/components/feedback/feedback-options';
import { useFeedbackStore } from '~/stores/feedback-store';
import type { AppRouter } from '~~/server/trpc/routes';

useSeoMeta({ title: '我的反馈 - Quanta Challenge' });

type RouterOutput = inferRouterOutputs<AppRouter>;
type Feedback =
   RouterOutput['protected']['feedback']['listMine']['items'][number];

const { $trpc } = useNuxtApp();
const filter = ref<FeedbackStatusFilter>('ALL');

const {
   items: feedbacks,
   status,
   loadingMore,
   refresh,
   sentinelRef,
} = useInfiniteList<Feedback, number>({
   key: 'my-feedbacks',
   pageSize: 20,
   fetchPage: (cursor, limit) =>
      $trpc.protected.feedback.listMine.query({
         cursor,
         limit,
         status: filter.value === 'ALL' ? undefined : filter.value,
      }),
});

// 提交反馈后由抽屉递增版本号；useAsyncData 会复用缓存，必须显式刷新。
// 版本号可能在页面挂载前就已递增（提交完才跳转），所以挂载时先比对一次。
const feedbackStore = useFeedbackStore();
const seenVersion = useState('my-feedback-seen-version', () => 0);

const refreshIfStale = async () => {
   if (feedbackStore.listVersion === seenVersion.value) return;
   await refresh();
   seenVersion.value = feedbackStore.listVersion;
};

onMounted(() => {
   void refresh();
});

watch(
   () => feedbackStore.listVersion,
   () => {
      void refreshIfStale();
   },
);

watch(filter, () => {
   void refresh();
});

const formatTime = (time: Date | string) =>
   dayjs(time).format('YYYY-MM-DD HH:mm');
</script>

<template>
   <div class="h-full w-full overflow-y-auto">
      <main
         class="mx-auto w-full max-w-[60rem] px-8 pb-40 pt-10 max-md:px-4 max-md:pt-6"
      >
         <header class="mb-7 flex items-center justify-between gap-4">
            <h1 class="text-3xl font-semibold tracking-tight max-md:text-2xl">
               我的反馈
            </h1>
            <StButton
               class="!rounded-lg px-4 py-2.5 text-sm"
               @click="feedbackStore.open()"
            >
               <span class="flex items-center gap-1.5"><Plus />提交反馈</span>
            </StButton>
         </header>

         <div class="mb-5 border-b border-accent-600 pb-3">
            <FeedbackStatusFilters v-model="filter" />
         </div>

         <div
            v-if="status === 'error'"
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
            v-if="status === 'pending' && !feedbacks.length"
            class="space-y-3"
         >
            <StSkeletonItem
               v-for="i in 3"
               :key="i"
               class="h-44 w-full rounded-2xl"
            />
         </div>
         <div
            v-else-if="!feedbacks.length && status !== 'error'"
            class="flex flex-col items-center gap-4 py-24 text-accent-300"
         >
            <Inbox class="text-4xl text-accent-400" />
            <p class="text-sm">
               {{ filter === 'ALL' ? '还没有反馈' : '暂无相关反馈' }}
            </p>
         </div>

         <div v-else class="space-y-4">
            <article
               v-for="feedback in feedbacks"
               :key="feedback.id"
               class="rounded-2xl border border-accent-600 bg-accent-600/20 p-6 max-md:p-4"
            >
               <div
                  class="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-accent-300"
               >
                  <span class="text-accent-400">#{{ feedback.id }}</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ feedbackTypeLabels[feedback.type] }}</span>
                  <time class="ml-auto text-accent-400">{{
                     formatTime(feedback.createdAt)
                  }}</time>
               </div>
               <div class="flex items-start justify-between gap-4">
                  <h2
                     class="min-w-0 break-words text-lg font-medium leading-7 max-md:text-base"
                  >
                     {{ feedback.title }}
                  </h2>
                  <FeedbackStatusBadge
                     :status="feedback.status"
                     class="mt-1.5"
                  />
               </div>
               <p
                  class="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-accent-300"
               >
                  {{ feedback.description }}
               </p>
               <p
                  v-if="feedback.baseProblem"
                  class="mt-3 text-xs text-accent-400"
               >
                  关联题目 ·
                  {{
                     feedback.baseProblem.CurrentProblem?.title ||
                        `#${feedback.baseProblemId}`
                  }}
               </p>
               <div
                  v-if="feedback.attachments.length"
                  class="mt-4 flex flex-wrap gap-2.5"
               >
                  <FeedbackScreenshot
                     v-for="image in feedback.attachments"
                     :key="image.id"
                     :id="image.id"
                  />
               </div>

               <div
                  v-if="feedback.reply"
                  class="mt-5 border-t border-accent-600 pt-4"
               >
                  <div
                     class="mb-2 flex items-center gap-2 text-xs text-accent-300"
                  >
                     <Comment class="text-primary" />管理员回复
                  </div>
                  <p
                     class="whitespace-pre-wrap break-words text-sm leading-6 text-accent-100"
                  >
                     {{ feedback.reply }}
                  </p>
               </div>

               <details
                  v-if="feedback.events.length"
                  class="group mt-4 text-xs text-accent-400"
               >
                  <summary
                     class="inline-flex cursor-pointer list-none items-center gap-1.5 hover:text-accent-200 [&::-webkit-details-marker]:hidden"
                  >
                     <span
                        class="transition-transform group-open:rotate-90"
                        aria-hidden="true"
                        >›</span
                     >处理记录
                  </summary>
                  <ol class="mt-4 space-y-4 border-l border-accent-500 pl-4">
                     <li v-for="event in feedback.events" :key="event.id">
                        <p class="flex flex-wrap gap-x-2 gap-y-1">
                           {{ event.actorName
                           }}<span>· {{ formatTime(event.createdAt) }}</span
                           ><span
                              >·
                              {{ feedbackStatuses[event.status].label }}</span
                           >
                        </p>
                        <p
                           class="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-accent-300"
                        >
                           {{ event.reply }}
                        </p>
                     </li>
                  </ol>
               </details>
            </article>
            <div
               :ref="(element) => { sentinelRef = element as HTMLElement | null; }"
               class="h-1"
            />
            <p
               v-if="loadingMore"
               class="py-4 text-center text-xs text-accent-400"
            >
               加载中…
            </p>
         </div>
      </main>
   </div>
</template>
