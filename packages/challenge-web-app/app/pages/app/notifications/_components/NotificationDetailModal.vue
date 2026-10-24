<script setup lang="ts">
import { Close, Left, Right, Calendar, Help } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import { dialog, useDialogManager } from '~/composables/use-dialog';
import { useMarkdown } from '~/composables/use-markdown';
import { useMessage } from '~/components/st/Message/use-message';

import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '~~/server/trpc/routes';
type RouterOutput = inferRouterOutputs<AppRouter>;
type Notification =
   RouterOutput['protected']['notification']['list']['items'][number];

const props = defineProps<{
   notification: Notification | null;
   hasPrevious?: boolean;
   hasNext?: boolean;
}>();

const emit = defineEmits<{
   prev: [];
   next: [];
   appealed: [id: string, appeal: NonNullable<Notification['appeal']>];
}>();
const opened = defineModel<boolean>('opened');

const cardRef = ref<HTMLElement | null>(null);

const close = () => {
   opened.value = false;
};

const { $trpc } = useNuxtApp();
const message = useMessage();
const { dialogs } = useDialogManager();
// 存在上层对话框时不处理遮罩与快捷键
const hasDialog = computed(() => dialogs.value.length > 0);

const APPEAL_STATUS_LABEL = {
   PENDING: '审核中',
   APPROVED: '申诉成功',
   REJECTED: '已驳回',
} as const;

const appealHint = computed(() => {
   const appeal = props.notification?.appeal;
   if (!appeal) return '如对该警告有异议，可提交申诉';
   const time = dayjs(appeal.createdAt).format('YYYY-MM-DD HH:mm');
   return `已于 ${time} 提交申诉 · ${APPEAL_STATUS_LABEL[appeal.status]}`;
});

const handleAppeal = async () => {
   const notification = props.notification;
   if (!notification) return;

   await dialog.prompt({
      title: '提交申诉',
      description: `针对警告「${notification.title}」，请说明你的申诉理由。每条警告只能申诉一次。`,
      placeholder: '请输入申诉内容（Ctrl / ⌘ + Enter 提交）',
      multiline: true,
      maxLength: 1000,
      confirmText: '提交申诉',
      validator: (value) => !!value.trim() || '申诉内容不能为空',
      onConfirm: async (value) => {
         const appeal = await $trpc.protected.notification.appeal.mutate({
            notificationId: notification.id,
            content: value,
         });
         emit('appealed', notification.id, appeal);
         message.success('申诉已提交', '管理员会尽快处理');
      },
   });
};

// 点击卡片（含悬浮按钮）以外的区域关闭
const handleOutsidePointerDown = (e: PointerEvent) => {
   if (!opened.value || hasDialog.value) return;
   const target = e.target as Node | null;
   if (!target) return;
   if (cardRef.value?.contains(target)) return;
   close();
};

const formattedTime = computed(() => {
   if (!props.notification) return '';
   return new Date(props.notification.createdAt).toLocaleString();
});

// 通知正文支持 Markdown 渲染（代码块带语言栏与复制按钮）
const { html, update } = useMarkdown({ codeHeader: true });
watch(
   () => props.notification?.content,
   (content) => update(content ?? ''),
   { immediate: true },
);

const handleKeydown = (e: KeyboardEvent) => {
   if (!opened.value || hasDialog.value) return;
   if (e.key === 'ArrowLeft' && props.hasPrevious) {
      emit('prev');
   } else if (e.key === 'ArrowRight' && props.hasNext) {
      emit('next');
   } else if (e.key === 'Escape') {
      close();
   }
};

onMounted(() => {
   window.addEventListener('keydown', handleKeydown);
   window.addEventListener('pointerdown', handleOutsidePointerDown);
});

onUnmounted(() => {
   window.removeEventListener('keydown', handleKeydown);
   window.removeEventListener('pointerdown', handleOutsidePointerDown);
});
</script>

<template>
   <StModal v-model:opened="opened">
      <div v-if="notification" ref="cardRef" class="relative">
         <!-- Card -->
         <div
            class="relative w-[50rem] max-w-[95vw] h-[36rem] max-h-[85vh] bg-accent-600 rounded-xl flex flex-col shadow-2xl border border-accent-500 overflow-hidden">
            <!-- Header Area -->
            <div class="px-10 pt-10 pb-6 shrink-0 bg-accent-600 z-10">
               <div class="flex justify-between items-start mb-4">
                  <div class="flex items-center gap-3">
                     <span
                        class="px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider border"
                        :class="
                           notification.type === 'WARNING'
                              ? 'bg-error/20 text-error border-error/60'
                              : 'bg-accent-500 text-accent-200 border-accent-500'
                        ">
                        {{ notification.type }}
                     </span>
                     <div
                        class="flex items-center gap-1.5 text-accent-400 text-sm">
                        <Calendar size="14" />
                        <span>{{ formattedTime }}</span>
                     </div>
                  </div>
                  <div
                     @click="close"
                     class="text-accent-400 hover:text-white transition-colors cursor-pointer p-2 -mr-2 -mt-2 hover:bg-accent-600 rounded-lg">
                     <Close size="1.5rem" />
                  </div>
               </div>
               <h2
                  class="text-3xl font-bold text-white leading-tight tracking-tight font-family-manrope">
                  {{ notification.title }}
               </h2>
            </div>

            <!-- Content Area -->
            <div class="flex-1 overflow-y-auto px-10 pb-10 custom-scrollbar">
               <LearningArticleBody :html="html" dense />
            </div>

            <div
               v-if="notification.type === 'WARNING'"
               class="relative z-10 shrink-0 px-10 py-5 border-t border-accent-500 flex items-center justify-between gap-4">
               <div class="flex flex-col gap-1">
                  <span
                     v-if="notification.scorePenalty"
                     class="st-font-body-bold"
                     :class="
                        notification.scorePenalty.revokedAt
                           ? 'text-success'
                           : 'text-error'
                     ">
                     {{
                        notification.scorePenalty.revokedAt
                           ? `扣除的 ${notification.scorePenalty.score} 分已恢复`
                           : `本次警告扣除 ${notification.scorePenalty.score} 分`
                     }}
                  </span>
                  <span class="st-font-caption text-accent-300">
                     {{ appealHint }}
                  </span>
               </div>
               <StButton
                  size="sm"
                  theme="danger"
                  bordered
                  :disabled="!!notification.appeal"
                  @click="handleAppeal">
                  <span class="flex items-center gap-1">
                     <Help />
                     {{
                        notification.appeal
                           ? APPEAL_STATUS_LABEL[notification.appeal.status]
                           : '申诉'
                     }}
                  </span>
               </StButton>
            </div>

            <div class="absolute right-24 bottom-12 z-0 opacity-20">
               <IconLogo class="scale-[500%] -rotate-[10deg]" />
            </div>
         </div>

         <!-- Floating Navigation (outside the card, only when available) -->
         <Transition name="nav-fade">
            <button
               v-if="hasPrevious"
               @click="$emit('prev')"
               aria-label="上一条"
               title="上一条"
               class="absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center rounded-full border bg-accent-500/80 border-accent-400/40 text-accent-100 backdrop-blur-sm shadow-lg transition-all left-1 size-9 min-[960px]:-left-14 min-[960px]:size-[2.5rem] hover:bg-primary hover:text-white hover:border-primary hover:scale-110 active:scale-95 cursor-pointer">
               <Left size="1.25rem" />
            </button>
         </Transition>

         <Transition name="nav-fade">
            <button
               v-if="hasNext"
               @click="$emit('next')"
               aria-label="下一条"
               title="下一条"
               class="absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center rounded-full border bg-accent-500/80 border-accent-400/40 text-accent-100 backdrop-blur-sm shadow-lg transition-all right-1 size-9 min-[960px]:-right-14 min-[960px]:size-[2.5rem] hover:bg-primary hover:text-white hover:border-primary hover:scale-110 active:scale-95 cursor-pointer">
               <Right size="1.25rem" />
            </button>
         </Transition>
      </div>
   </StModal>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
   width: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
   background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
   background-color: #4b5563;
   border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
   background-color: #6b7280;
}

.nav-fade-enter-active,
.nav-fade-leave-active {
   transition: opacity 0.2s ease;
}

.nav-fade-enter-from,
.nav-fade-leave-to {
   opacity: 0;
}
</style>
