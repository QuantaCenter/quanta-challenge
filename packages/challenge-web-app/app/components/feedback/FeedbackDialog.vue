<script setup lang="ts">
import { createReusableTemplate } from '@vueuse/core';
import { Bug, CircleCheck, Lightbulb, Link2, Mail, MessageSquareText, X } from 'lucide-vue-next';
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, FocusScope } from 'reka-ui';
import { z } from 'zod';
import useAuthStore from '~/stores/auth-store';
import { atLeastTime } from '~/utils/wait';

const categories = [
   { value: 'bug', label: '遇到问题', icon: Bug, prompt: '你做了什么？实际发生了什么？你预期会看到什么？' },
   { value: 'suggestion', label: '功能建议', icon: Lightbulb, prompt: '你希望改进什么？它能帮你完成什么？' },
   { value: 'other', label: '其他', icon: MessageSquareText, prompt: '可以告诉我们发生了什么，或你希望我们了解什么。' },
] as const;

const minDescriptionLength = 10;
const maxDescriptionLength = 2000;
const maxContactLength = 254;
const { context } = useFeedback();
const { $trpc, $ensureFreshToken } = useNuxtApp();
const authStore = useAuthStore();
const isMobile = useIsMobile();
const opened = computed(() => context.value !== null);
const displayedContext = shallowRef<typeof context.value>(null);
const [DefineForm, ReuseForm] = createReusableTemplate();
const drawerTitleId = useId();
const drawerDescriptionId = useId();
const form = useTemplateRef('form');
const dialogTitle = useTemplateRef('dialog-title');
const category = ref<(typeof categories)[number]['value'] | ''>('');
const description = ref('');
const contact = ref('');
const notifyOnResolve = ref(false);
const verifiedSignedIn = ref(false);
const checkingSession = ref(false);
const signedIn = computed(() => Boolean(authStore.user) || verifiedSignedIn.value);
const includeContext = ref(true);
const submitting = ref(false);
const attemptedSubmit = ref(false);
const submissionError = ref('');
const receipt = ref<string>();
let trigger: HTMLElement | undefined;
let lastAttempt: { payload: string; id: string } | undefined;
let resetReceiptOnOpen = false;

const prompt = computed(() => categories.find((item) => item.value === category.value)?.prompt);
const descriptionError = computed(() => attemptedSubmit.value && description.value.trim().length < minDescriptionLength);
const contactError = computed(() => !signedIn.value && attemptedSubmit.value && Boolean(contact.value.trim()) && !z.email().safeParse(contact.value.trim()).success);

function focusTitle() {
   const title = dialogTitle.value;
   const element = title instanceof HTMLElement ? title : title?.$el;
   element?.focus({ preventScroll: true });
}

watch(opened, async (isOpen) => {
   if (isOpen) {
      const currentContext = context.value;
      displayedContext.value = currentContext;
      attemptedSubmit.value = false;
      if (resetReceiptOnOpen) receipt.value = undefined;
      resetReceiptOnOpen = false;
      trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      verifiedSignedIn.value = false;
      checkingSession.value = Boolean(authStore.csrfToken && !authStore.user);
      if (checkingSession.value) {
         try {
            await $ensureFreshToken();
            const session = await $trpc.public.feedback.session.query();
            if (context.value === currentContext) verifiedSignedIn.value = session.signedIn;
         } catch {
            // Public pages still accept guest feedback when no session can be verified.
         } finally {
            if (context.value === currentContext) checkingSession.value = false;
         }
      }
   }
}, { flush: 'sync' });

function onOpenAutoFocus(event: Event) {
   event.preventDefault();
   focusTitle();
}

function onCloseAutoFocus(event: Event) {
   event.preventDefault();
   if (opened.value) return;
   trigger?.focus({ preventScroll: true });
   trigger = undefined;
}

function closeDialog() {
   // Keep the drawer content in place until the closing transition finishes.
   resetReceiptOnOpen = Boolean(receipt.value);
   context.value = null;
}

async function submit() {
   if (submitting.value || checkingSession.value || !context.value) return;

   attemptedSubmit.value = true;
   submissionError.value = '';
   if (!category.value || descriptionError.value || contactError.value) {
      await nextTick();
      form.value?.querySelector<HTMLElement>('input[aria-invalid=true], textarea[aria-invalid=true]')?.focus();
      return;
   }

   const payload = {
      category: category.value,
      description: description.value.trim(),
      contact: signedIn.value ? undefined : contact.value.trim() || undefined,
      notifyOnResolve: signedIn.value && notifyOnResolve.value,
      ...(includeContext.value ? context.value : {}),
   };
   const serialized = JSON.stringify(payload);
   if (lastAttempt?.payload !== serialized) {
      const id = globalThis.crypto?.randomUUID?.();
      lastAttempt = id ? { payload: serialized, id } : undefined;
   }

   const sendFeedback = async () => {
      if (signedIn.value) await $ensureFreshToken();
      return $trpc.public.feedback.submit.mutate({ ...payload, submissionId: lastAttempt?.id });
   };

   submitting.value = true;
   try {
      // Keep the loading state visible for quick errors as well as quick successes.
      const [result] = await atLeastTime(500, Promise.allSettled([sendFeedback()]));
      if (result.status === 'rejected') throw result.reason;

      receipt.value = result.value.id;
      category.value = '';
      description.value = '';
      contact.value = '';
      notifyOnResolve.value = false;
      includeContext.value = true;
      attemptedSubmit.value = false;
      lastAttempt = undefined;
      await nextTick();
      focusTitle();
   } catch (error) {
      const code = (error as { data?: { code?: string } })?.data?.code;
      if (code === 'TOO_MANY_REQUESTS') {
         submissionError.value = '提交次数较多，请稍后再试。已保留你填写的内容。';
      } else if (code === 'UNAUTHORIZED') {
         submissionError.value = '登录已失效，请重新登录后提交，或关闭站内通知后重试。';
      } else {
         submissionError.value = '提交未成功。已保留你填写的内容，请稍后重试。';
      }
   } finally {
      submitting.value = false;
   }
}
</script>

<template>
   <DefineForm>
      <header class="flex shrink-0 items-start gap-3 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
         <div
            v-if="receipt"
            class="grid size-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success sm:size-11">
            <CircleCheck :size="22" aria-hidden="true" />
         </div>
         <div class="min-w-0 flex-1">
            <component :is="isMobile ? 'h2' : DialogTitle" ref="dialog-title" v-bind="isMobile ? { id: drawerTitleId } : {}" tabindex="-1" class="text-lg font-bold outline-none sm:text-xl">
               {{ receipt ? '反馈已收到' : '意见反馈' }}
            </component>
            <component :is="isMobile ? 'p' : DialogDescription" v-bind="isMobile ? { id: drawerDescriptionId } : {}" class="mt-1 text-sm leading-relaxed text-accent-300">
               {{ receipt ? '感谢你的反馈，我们会查看并跟进。' : '遇到了问题，或者有改进建议？欢迎告诉我们。' }}
            </component>
         </div>
         <button
            type="button"
            aria-label="关闭反馈"
            class="-mr-1 inline-grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg text-accent-300 transition-colors hover:bg-accent-600 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
            @click="closeDialog">
            <X :size="19" aria-hidden="true" />
         </button>
      </header>

      <div v-if="receipt" class="flex flex-col gap-5 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
         <div class="rounded-xl border border-accent-500/70 bg-background px-4 py-3">
            <span class="block text-xs text-accent-300">反馈编号</span>
            <span class="st-selectable mt-1 block break-all font-family-manrope text-sm text-accent-100">{{ receipt }}</span>
         </div>
         <StButton class="self-end !px-6 !font-semibold" @click="closeDialog">完成</StButton>
      </div>

      <form v-else ref="form" novalidate class="flex min-h-0 flex-col" :aria-busy="submitting" @submit.prevent="submit">
         <div class="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 pt-1 pb-4 sm:space-y-4 sm:px-6 sm:pb-5">
            <fieldset :disabled="submitting">
               <legend class="mb-2 text-sm font-semibold">反馈类型</legend>
               <div class="grid grid-cols-3 gap-2">
                  <label v-for="item in categories" :key="item.value" class="relative">
                     <input
                        v-model="category"
                        type="radio"
                        name="category"
                        :value="item.value"
                        :aria-invalid="attemptedSubmit && !category"
                        :aria-describedby="attemptedSubmit && !category ? 'feedback-category-error' : undefined"
                        required
                        class="peer sr-only" />
                     <span
                        class="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-1 text-[0.8125rem] whitespace-nowrap transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:cursor-wait sm:gap-2 sm:text-sm"
                        :class="category === item.value
                           ? 'border-primary/80 bg-primary/10 text-primary hover:bg-primary/15'
                           : 'border-accent-500 bg-background text-accent-200 hover:border-accent-400 hover:text-white'">
                        <component :is="item.icon" :size="16" class="shrink-0 max-[360px]:hidden" aria-hidden="true" />
                        {{ item.label }}
                     </span>
                  </label>
               </div>
               <p v-if="attemptedSubmit && !category" id="feedback-category-error" class="mt-1.5 text-xs text-red-300">
                  请选择反馈类型。
               </p>
            </fieldset>

            <div>
               <div class="mb-2 flex items-baseline justify-between gap-2">
                  <span id="feedback-description-label" class="text-sm font-semibold">反馈描述</span>
                  <span class="font-family-manrope text-xs tabular-nums text-accent-300">{{ description.length }} / {{ maxDescriptionLength }}</span>
               </div>
               <StTextarea
                  v-model:value="description"
                  aria-labelledby="feedback-description-label"
                  :aria-describedby="descriptionError ? 'feedback-description-error' : 'feedback-description-hint'"
                  :aria-invalid="descriptionError"
                  :disabled="submitting"
                  :maxlength="maxDescriptionLength"
                  required
                  rows="4"
                  name="description"
                  placeholder="请描述具体问题或建议"
                  :status="descriptionError ? 'error' : undefined"
                  outer-class="!px-3 !py-2.5 !items-start border border-accent-500 bg-background focus-within:border-primary"
                  class="min-w-0 resize-y text-base leading-relaxed sm:text-sm" />
               <p v-if="descriptionError" id="feedback-description-error" class="mt-1.5 text-xs text-red-300">
                  请填写至少 {{ minDescriptionLength }} 个字符，帮助我们了解详情。
               </p>
               <p v-else id="feedback-description-hint" class="mt-1.5 text-xs leading-relaxed text-accent-300">
                  {{ prompt ?? '描述时可以提到操作步骤、看到的结果，或希望改进的地方。' }}
               </p>
            </div>

            <label
               v-if="signedIn"
               for="feedback-notify-switch"
               class="flex items-center justify-between gap-3 rounded-lg border border-accent-500/70 bg-accent-600/45 px-3 py-2.5 transition-colors"
               :class="submitting ? 'cursor-wait' : 'cursor-pointer hover:border-accent-400'">
               <span id="feedback-notify-label" class="text-sm text-accent-100">处理完成后通过站内通知告诉我</span>
               <StSwitch
                  id="feedback-notify-switch"
                  v-model="notifyOnResolve"
                  :disabled="submitting"
                  aria-labelledby="feedback-notify-label" />
            </label>

            <div v-else-if="!checkingSession">
               <div class="mb-2 flex items-baseline gap-2">
                  <span id="feedback-contact-label" class="text-sm font-semibold">联系邮箱</span>
                  <span class="text-xs text-accent-300">选填</span>
               </div>
               <StInput
                  v-model:value="contact"
                  type="email"
                  name="email"
                  autocomplete="email"
                  aria-labelledby="feedback-contact-label"
                  :aria-describedby="contactError ? 'feedback-contact-error' : undefined"
                  :aria-invalid="contactError"
                  :disabled="submitting"
                  :maxlength="maxContactLength"
                  :status="contactError ? 'error' : undefined"
                  outer-class="!gap-2.5 !px-3 !py-2.5 border border-accent-500 bg-background focus-within:border-primary"
                  class="min-w-0 text-base sm:text-sm"
                  placeholder="如愿意接收回复，请留下邮箱">
                  <template #prefix><Mail :size="16" class="shrink-0" aria-hidden="true" /></template>
               </StInput>
               <p v-if="contactError" id="feedback-contact-error" class="mt-1.5 text-xs text-red-300">
                  请输入有效的邮箱地址。
               </p>
            </div>

            <label
               v-if="displayedContext?.pagePath || displayedContext?.traceId"
               for="feedback-context-switch"
               class="flex items-center justify-between gap-3 rounded-lg border border-accent-500/70 bg-accent-600/45 px-3 py-2.5 transition-colors"
               :class="submitting ? 'cursor-wait' : 'cursor-pointer hover:border-accent-400'">
               <span class="min-w-0 flex-1">
                  <span id="feedback-context-label" class="block text-sm text-accent-100">
                     同时附上当前页面{{ displayedContext.traceId ? '和错误编号' : '' }}
                  </span>
                  <span id="feedback-context-details" class="block">
                     <span v-if="displayedContext.pagePath" class="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-accent-300">
                        <Link2 :size="13" class="mt-0.5 shrink-0" aria-hidden="true" />
                        <span class="min-w-0 break-all font-family-manrope">{{ displayedContext.pagePath }}</span>
                     </span>
                     <span v-if="displayedContext.traceId" class="mt-1 block break-all font-family-manrope text-xs text-accent-300">{{ displayedContext.traceId }}</span>
                  </span>
               </span>
               <StSwitch
                  id="feedback-context-switch"
                  v-model="includeContext"
                  :disabled="submitting"
                  aria-labelledby="feedback-context-label"
                  aria-describedby="feedback-context-details"
                  class="disabled:cursor-wait" />
            </label>
         </div>

         <footer class="shrink-0 border-t border-accent-500/70 px-4 py-3 sm:px-6 sm:py-4">
            <p v-if="submissionError" role="alert" class="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2.5 text-sm leading-relaxed text-red-200">
               {{ submissionError }}
            </p>
            <div class="flex items-center gap-3">
               <p class="min-w-0 flex-1 text-xs leading-relaxed text-accent-300">请勿填写密码、令牌等敏感信息。</p>
               <StButton
                  type="submit"
                  text="提交反馈"
                  :loading="submitting"
                  :disabled="checkingSession"
                  class="min-h-11 min-w-32 shrink-0 !px-5 !py-2.5 !text-sm !font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
            </div>
         </footer>
      </form>
   </DefineForm>

   <StDrawer
      v-if="isMobile"
      v-slot="{ rendered }"
      :opened="opened"
      global
      fit
      background-color="#1a1a1a"
      panel-class="flex min-h-0! flex-col overflow-hidden motion-reduce:transition-none"
      @update:opened="!$event && closeDialog()">
      <FocusScope
         v-if="rendered"
         :trapped="opened"
         loop
         as-child
         @mount-auto-focus="onOpenAutoFocus"
         @unmount-auto-focus="onCloseAutoFocus">
         <div
            role="dialog"
            :aria-modal="opened ? 'true' : undefined"
            :aria-labelledby="drawerTitleId"
            :aria-describedby="drawerDescriptionId"
            :inert="!opened"
            class="flex min-h-0 flex-col overflow-hidden pt-3 pb-[env(safe-area-inset-bottom)]"
            @keydown.esc.stop="closeDialog">
            <ReuseForm />
         </div>
      </FocusScope>
   </StDrawer>

   <DialogRoot v-else :open="opened" @update:open="!$event && closeDialog()">
      <DialogPortal>
         <DialogOverlay class="feedback-overlay fixed inset-0 z-[10010] bg-black/65 backdrop-blur-[2px]" />
         <DialogContent
            class="feedback-panel fixed inset-x-0 top-1/2 z-[10011] mx-auto flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-accent-500 bg-[#1a1a1a] text-white shadow-2xl shadow-black/55 outline-none"
            @open-auto-focus="onOpenAutoFocus"
            @close-auto-focus="onCloseAutoFocus">
            <ReuseForm />
         </DialogContent>
      </DialogPortal>
   </DialogRoot>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
   .feedback-overlay[data-state='open'] {
      animation: feedback-overlay-enter 180ms ease-out both;
   }

   .feedback-panel[data-state='open'] {
      animation: feedback-panel-enter 220ms ease-out both;
   }
}

@keyframes feedback-overlay-enter {
   from { opacity: 0; }
   to { opacity: 1; }
}

@keyframes feedback-panel-enter {
   from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
   }
   to {
      opacity: 1;
      transform: none;
   }
}
</style>
