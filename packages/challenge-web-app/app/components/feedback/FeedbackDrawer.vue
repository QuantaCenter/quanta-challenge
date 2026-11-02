<script setup lang="ts">
import {
   Bug,
   Close,
   FileText,
   Light,
   Link,
   More,
   Picture,
} from '@icon-park/vue-next';
import { onClickOutside, useDebounceFn } from '@vueuse/core';
import type { Component } from 'vue';
import { useMessageOutsideVue } from '~/components/st/Message/use-message';
import { useFeedbackStore } from '~/stores/feedback-store';
import { type FeedbackType, feedbackTypeLabels } from './feedback-options';

const opened = defineModel<boolean>('opened', { default: false });

const { $trpc } = useNuxtApp();
const feedbackStore = useFeedbackStore();

// 消息提示：抽屉挂在布局根、不在 MessageProvider 内，且 SSR 阶段无 provider，
// 因此只在用户操作（客户端事件）里延迟获取全局实例。
const message = () => useMessageOutsideVue();

const route = useRoute();
const router = useRouter();
const uploading = ref(false);
const navigatingToFeedback = ref(false);
let submissionKey: string | undefined;

const typeOptions: {
   label: string;
   value: FeedbackType;
   icon: Component;
}[] = [
   { label: feedbackTypeLabels.bug, value: 'bug', icon: Bug },
   {
      label: feedbackTypeLabels.problem_judge,
      value: 'problem_judge',
      icon: FileText,
   },
   { label: feedbackTypeLabels.suggestion, value: 'suggestion', icon: Light },
   { label: feedbackTypeLabels.other, value: 'other', icon: More },
];

const form = reactive({
   type: 'bug' as FeedbackType,
   title: '',
   description: '',
   diagnostic: true,
});

// 关联题目（baseId）
const selectedProblem = ref<{
   baseId: number;
   pid: number;
   title: string;
} | null>(null);

// 搜题选择器状态
const keyword = ref('');
const searchResults = ref<{ baseId: number; pid: number; title: string }[]>([]);
const searchOpened = ref(false);
const searchRoot = useTemplateRef<HTMLElement>('search-root');
const imageInput = useTemplateRef<HTMLInputElement>('image-input');
onClickOutside(searchRoot, () => {
   searchOpened.value = false;
});

let requestSeq = 0;
const search = useDebounceFn(async (q: string) => {
   if (!q.trim()) {
      searchResults.value = [];
      return;
   }
   const seq = ++requestSeq;
   try {
      const problems = await $trpc.protected.feedback.searchProblems.query({
         keyword: q.trim(),
         limit: 8,
      });
      if (seq !== requestSeq) return;
      searchResults.value = problems;
      searchOpened.value = true;
   } catch {
      if (seq === requestSeq) searchResults.value = [];
   }
}, 300);

watch(keyword, (v) => {
   search(v);
});

const pickProblem = (problem: {
   baseId: number;
   pid: number;
   title: string;
}) => {
   selectedProblem.value = problem;
   keyword.value = '';
   searchResults.value = [];
   searchOpened.value = false;
};

const clearProblem = () => {
   selectedProblem.value = null;
};
watch(opened, async (value) => {
   if (!value || selectedProblem.value) return;
   const path = route.path;
   try {
      const context = await $trpc.protected.feedback.context.query({ path });
      if (
         opened.value &&
         route.path === path &&
         !selectedProblem.value &&
         context
      )
         selectedProblem.value = context;
   } catch {
      /* 手动搜索关联题目仍然可用。 */
   }
});

// 截图通过反馈专用接口上传，最多保留 3 张。
const images = ref<{ id: string; url: string }[]>([]);

const addImages = async (files: File[]) => {
   if (uploading.value) return;
   uploading.value = true;
   try {
      for (const file of files) {
         if (images.value.length >= 3) {
            message().warning('最多添加 3 张截图');
            break;
         }
         if (
            !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
            file.size > 5 * 1024 * 1024
         ) {
            message().warning('请选择不超过 5MB 的 PNG、JPG 或 WebP 图片');
            continue;
         }
         const formData = new FormData();
         formData.append('file', file);
         const result =
            await $trpc.protected.feedback.uploadScreenshot.mutate(formData);
         images.value.push({ id: result.id, url: URL.createObjectURL(file) });
      }
   } catch {
      message().error('截图上传失败', '已上传的截图已保留，请稍后重试');
   } finally {
      uploading.value = false;
   }
};

const handleSelectImage = async (event: Event) => {
   const input = event.target as HTMLInputElement;
   await addImages(Array.from(input.files || []));
   input.value = '';
};
const removeImage = (index: number) => {
   const [image] = images.value.splice(index, 1);
   if (image) URL.revokeObjectURL(image.url);
};
const pasteImages = (event: ClipboardEvent) => {
   const files = Array.from(event.clipboardData?.files || []).filter((file) =>
      file.type.startsWith('image/'),
   );
   if (!files.length) return;
   event.preventDefault();
   void addImages(files);
};
const dropImages = (event: DragEvent) => {
   void addImages(Array.from(event.dataTransfer?.files || []));
};
onUnmounted(() => {
   for (const image of images.value) URL.revokeObjectURL(image.url);
});

const submitting = ref(false);

const handleSubmit = async () => {
   if (submitting.value || uploading.value) return;
   if (!form.title.trim()) {
      message().warning('请填写一句话描述');
      return;
   }
   if (!form.description.trim()) {
      message().warning('请填写详细描述');
      return;
   }
   submitting.value = true;
   submissionKey ??= crypto.randomUUID();
   try {
      const result = await $trpc.protected.feedback.submit.mutate({
         submissionKey,
         type: form.type,
         pagePath: route.path,
         diagnostic: form.diagnostic
            ? {
                 browser: navigator.userAgent.slice(0, 300),
                 platform: navigator.platform.slice(0, 100),
                 viewport: `${window.innerWidth}x${window.innerHeight}`,
              }
            : undefined,
         title: form.title.trim(),
         description: form.description.trim(),
         baseProblemId: selectedProblem.value?.baseId,
         imageIds: images.value.map((i) => i.id),
      });
      message().success(
         `反馈 #${result.id} 已提交`,
         '可在我的反馈中跟进处理进度',
      );
      form.title = '';
      submissionKey = undefined;
      form.description = '';
      while (images.value.length) removeImage(0);
      selectedProblem.value = null;
      // 列表首屏数据有 useAsyncData 缓存，必须显式标记过期，否则回到「我的反馈」看不到新记录
      feedbackStore.markListDirty();
      opened.value = false;
   } catch {
      message().error('提交失败', '请稍后重试');
   } finally {
      submitting.value = false;
   }
};

const goToMyFeedback = async () => {
   if (!import.meta.client || navigatingToFeedback.value) return;
   navigatingToFeedback.value = true;
   try {
      // popstate 发生时路由守卫仍在运行，必须等本次路由完成再发起跳转。
      const released = window.history.state?.stHistoryLayer
         ? new Promise<void>((resolve, reject) => {
              const stopAfterEach = router.afterEach(() => {
                 stopAfterEach();
                 stopError();
                 resolve();
              });
              const stopError = router.onError((error) => {
                 stopAfterEach();
                 stopError();
                 reject(error);
              });
           })
         : Promise.resolve();
      opened.value = false;
      await released;
      await navigateTo('/app/feedback');
   } catch {
      message().error('跳转失败', '请稍后重试');
   } finally {
      navigatingToFeedback.value = false;
   }
};
</script>

<template>
   <ClientOnly>
      <StDrawer global v-model:opened="opened" width="34rem">
         <div
            class="flex h-full min-h-0 flex-col bg-background text-accent-100 max-md:rounded-t-2xl"
         >
            <header
               class="flex shrink-0 items-center justify-between border-b border-accent-600 px-7 py-5 max-md:px-5 max-md:pt-7"
            >
               <h1 class="text-xl font-semibold tracking-tight">问题反馈</h1>
               <div class="flex items-center gap-4">
                  <button
                     type="button"
                     :disabled="navigatingToFeedback"
                     class="cursor-pointer text-sm text-accent-300 transition-colors hover:text-white"
                     @click="goToMyFeedback"
                  >
                     我的反馈
                  </button>
                  <button
                     type="button"
                     aria-label="关闭反馈"
                     class="flex size-8 cursor-pointer items-center justify-center rounded-lg text-accent-300 transition-colors hover:bg-accent-600 hover:text-white"
                     @click="opened = false"
                  >
                     <Close class="text-lg" />
                  </button>
               </div>
            </header>

            <form
               aria-label="反馈内容"
               class="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-7 py-6 max-md:space-y-5 max-md:px-5"
               @paste="pasteImages"
               @dragover.prevent
               @drop.prevent="dropImages"
               @submit.prevent="handleSubmit"
            >
               <fieldset>
                  <legend class="mb-3 text-sm font-medium">反馈类型</legend>
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                     <button
                        v-for="option in typeOptions"
                        :key="option.value"
                        type="button"
                        :aria-pressed="form.type === option.value"
                        class="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary"
                        :class="form.type === option.value ? 'border-primary/60 bg-primary/10 text-primary' : 'border-accent-600 bg-accent-600/30 text-accent-300 hover:border-accent-500 hover:text-white'"
                        @click="form.type = option.value"
                     >
                        <Component :is="option.icon" class="text-base" />
                        {{ option.label }}
                     </button>
                  </div>
               </fieldset>

               <div class="space-y-2">
                  <label for="feedback-title" class="text-sm font-medium"
                     >标题 <span class="text-primary">*</span></label
                  >
                  <input
                     id="feedback-title"
                     v-model="form.title"
                     maxlength="80"
                     placeholder="一句话描述你的问题"
                     class="w-full rounded-xl border border-accent-600 bg-accent-600/30 px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-accent-400 focus:border-primary/70"
                  >
               </div>

               <div class="space-y-2">
                  <div class="flex items-center justify-between">
                     <label
                        for="feedback-description"
                        class="text-sm font-medium"
                        >详细描述 <span class="text-primary">*</span></label
                     >
                     <span class="text-xs tabular-nums text-accent-400"
                        >{{ form.description.length }}
                        / 3000</span
                     >
                  </div>
                  <textarea
                     id="feedback-description"
                     v-model="form.description"
                     rows="6"
                     maxlength="3000"
                     placeholder="发生了什么？你希望如何改进？"
                     class="min-h-36 w-full resize-y rounded-xl border border-accent-600 bg-accent-600/30 px-3.5 py-3 text-sm leading-6 outline-none transition-colors placeholder:text-accent-400 focus:border-primary/70"
                  />
               </div>

               <section class="space-y-3" aria-label="问题截图">
                  <div class="flex items-center justify-between text-sm">
                     <h2 class="font-medium">
                        截图
                        <span class="ml-1 text-xs font-normal text-accent-400"
                           >选填</span
                        >
                     </h2>
                     <span class="text-xs text-accent-400"
                        >{{ images.length }}
                        / 3 · 每张不超过 5MB</span
                     >
                  </div>
                  <div class="flex flex-wrap gap-3">
                     <div
                        v-for="(image, index) in images"
                        :key="image.id"
                        class="relative size-20"
                     >
                        <FeedbackScreenshot :id="image.id" />
                        <button
                           type="button"
                           :aria-label="`移除截图 ${index + 1}`"
                           :disabled="submitting"
                           class="absolute -right-1.5 -top-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full border border-accent-500 bg-accent-600 text-white disabled:cursor-wait"
                           @click="removeImage(index)"
                        >
                           <Close class="text-xs" />
                        </button>
                     </div>
                     <button
                        v-if="images.length < 3"
                        type="button"
                        :disabled="uploading || submitting"
                        class="flex size-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-accent-500 text-accent-300 transition-colors hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-50"
                        @click="imageInput?.click()"
                     >
                        <Picture class="text-xl" />
                        <span class="text-xs">{{
                           uploading ? '上传中…' : '添加截图'
                        }}</span>
                     </button>
                  </div>
                  <input
                     ref="image-input"
                     type="file"
                     accept=".png,.jpg,.jpeg,.webp"
                     multiple
                     class="hidden"
                     @change="handleSelectImage"
                  >
               </section>

               <details
                  class="group border-t border-accent-600 pt-4"
                  :open="!!selectedProblem"
               >
                  <summary
                     class="flex cursor-pointer list-none items-center justify-between text-sm text-accent-300 hover:text-white [&::-webkit-details-marker]:hidden"
                  >
                     <span
                        >补充信息
                        <span
                           v-if="selectedProblem"
                           class="ml-2 text-xs text-primary"
                           >已关联题目</span
                        ></span
                     >
                     <span
                        class="text-lg leading-none transition-transform group-open:rotate-45"
                        aria-hidden="true"
                        >+</span
                     >
                  </summary>
                  <div class="space-y-4 pt-4">
                     <div ref="search-root" class="relative space-y-2">
                        <label
                           for="feedback-problem"
                           class="text-xs text-accent-300"
                           >关联题目</label
                        >
                        <div
                           v-if="selectedProblem"
                           class="flex items-center gap-2 rounded-xl border border-accent-600 bg-accent-600/30 px-3.5 py-3 text-sm"
                        >
                           <Link class="text-accent-300" />
                           <span class="text-primary"
                              >#{{ selectedProblem.pid }}</span
                           >
                           <span class="min-w-0 flex-1 truncate">{{
                              selectedProblem.title
                           }}</span>
                           <button
                              type="button"
                              aria-label="取消关联题目"
                              class="cursor-pointer text-accent-300 hover:text-white"
                              @click="clearProblem"
                           >
                              <Close />
                           </button>
                        </div>
                        <input
                           v-else
                           id="feedback-problem"
                           v-model="keyword"
                           placeholder="搜索题目名称"
                           class="w-full rounded-xl border border-accent-600 bg-accent-600/30 px-3.5 py-3 text-sm outline-none placeholder:text-accent-400 focus:border-primary/70"
                        >
                        <div
                           v-if="searchOpened && searchResults.length"
                           class="mt-2 max-h-48 overflow-y-auto rounded-xl border border-accent-500 bg-accent-600"
                        >
                           <button
                              v-for="problem in searchResults"
                              :key="problem.baseId"
                              type="button"
                              class="block w-full cursor-pointer px-4 py-3 text-left text-sm hover:bg-accent-500"
                              @click="pickProblem(problem)"
                           >
                              <span class="mr-2 text-primary"
                                 >#{{ problem.pid }}</span
                              >{{ problem.title }}
                           </button>
                        </div>
                     </div>
                     <div class="flex items-center justify-between gap-4">
                        <span
                           class="text-sm text-accent-300"
                           id="feedback-diagnostic-label"
                           >附带设备信息</span
                        >
                        <StSwitch
                           v-model="form.diagnostic"
                           aria-labelledby="feedback-diagnostic-label"
                        />
                     </div>
                     <p class="text-xs leading-5 text-accent-400">
                        仅浏览器、系统和屏幕尺寸。
                     </p>
                  </div>
               </details>
            </form>

            <footer
               class="flex shrink-0 items-center justify-end gap-3 border-t border-accent-600 px-7 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-md:px-5"
            >
               <StButton
                  theme="secondary"
                  bordered
                  class="!rounded-lg !border-accent-500 !text-accent-200 px-5 py-2.5"
                  @click="opened = false"
                  >取消</StButton
               >
               <StButton
                  :loading="submitting || uploading"
                  :disabled="submitting || uploading"
                  class="!rounded-lg px-6 py-2.5"
                  @click="handleSubmit"
                  >提交反馈</StButton
               >
            </footer>
         </div>
      </StDrawer>
   </ClientOnly>
</template>
