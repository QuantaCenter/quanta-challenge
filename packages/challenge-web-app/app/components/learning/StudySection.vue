<script setup lang="ts">
import { CheckOne, Refresh } from '@icon-park/vue-next';
import ArticleBody from './ArticleBody.vue';
import ProblemWorkspace from './ProblemWorkspace.vue';
import { useMessage } from '~/components/st/Message/use-message';
import { useLearningSection } from '~/composables/use-learning-section';

const props = defineProps<{ courseId: string; sectionId: string; completed: boolean }>();
const emit = defineEmits<{ completed: [] }>();
const { $trpc } = useNuxtApp();
const message = useMessage();
const sectionLoader = useLearningSection();
const { data: section, pending, error, refresh } = await useAsyncData(
   () => `learning-section-${props.courseId}-${props.sectionId}`,
   () => sectionLoader.load(props.courseId, props.sectionId),
);
const { html, blocks, update } = useMarkdown({ codeHeader: true, playground: true });
watch(() => section.value?.articleContent, content => update(content ?? ''), { immediate: true });
const { html: rawProblemHtml, update: updateProblem } = useMarkdown({ codeHeader: true });
watch(() => section.value?.problem?.detail, detail => updateProblem(detail ?? ''), { immediate: true });
/** 题面常带裸 <style>，经 v-html 注入会全局生效，与做题页一样剥掉 */
const problemHtml = computed(() => rawProblemHtml.value.replace(/<style[\s\S]*?<\/style>/gi, ''));
const end = useTemplateRef('end');
const reachedEnd = ref(false);
const saving = ref(false);
const checking = ref(false);
const saved = ref(false);
const saveError = ref(false);
const isCompleted = computed(() => props.completed || saved.value);
let observer: IntersectionObserver | undefined;

function checkStatus() {
   if (saving.value || checking.value) return;
   checking.value = true;
   void complete(true);
}

async function complete(notify = false) {
   if (saving.value || isCompleted.value || !section.value) return;
   if (section.value.type === 'article' && !reachedEnd.value) return;
   saving.value = true;
   saveError.value = false;
   try {
      const result = await $trpc.protected.learning.completeSection.mutate({ id: props.courseId, sectionId: props.sectionId });
      if (result.completed) {
         saved.value = true;
         emit('completed');
      } else if (notify) {
         message.info('尚未通过', '完成本节解锁后的题目提交并通过判题，即可完成本节。');
      }
   } catch {
      saveError.value = true;
      if (notify) message.error('进度保存失败，请重试');
   } finally {
      saving.value = false;
   }
}

function observeEnd() {
   observer?.disconnect();
   if (!end.value || section.value?.type !== 'article' || isCompleted.value) return;
   if (section.value.articleContent?.trim() && !html.value) return;
   observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      reachedEnd.value = true;
      observer?.disconnect();
      void complete();
   }, { threshold: 1 });
   observer.observe(end.value);
}
watch([html, end], () => nextTick(observeEnd), { flush: 'post' });
const onFocus = () => {
   if (section.value?.type === 'problem') void complete();
};
/** 内嵌做题页提交后判题是异步的：轮询一段时间，通过即自动完成本节 */
const JUDGE_POLL_INTERVAL = 4000;
const JUDGE_POLL_TIMES = 30;
let judgePollTimer: ReturnType<typeof setInterval> | undefined;
function onCommitted() {
   clearInterval(judgePollTimer);
   let remaining = JUDGE_POLL_TIMES;
   judgePollTimer = setInterval(() => {
      remaining -= 1;
      if (isCompleted.value || remaining <= 0) {
         clearInterval(judgePollTimer);
         return;
      }
      void complete();
   }, JUDGE_POLL_INTERVAL);
}
onMounted(() => {
   observeEnd();
   window.addEventListener('focus', onFocus);
   if (section.value?.type === 'problem') void complete();
});
onBeforeUnmount(() => {
   observer?.disconnect();
   clearInterval(judgePollTimer);
   window.removeEventListener('focus', onFocus);
});
</script>

<template>
   <StSpace v-if="pending" center fill-x class="py-20 text-accent-300">
      正在加载内容…
   </StSpace>
   <StSpace v-else-if="error || !section" direction="vertical" gap="1rem">
      <p class="text-accent-300">内容加载失败，或当前内容尚未解锁。</p>
      <StButton bordered size="sm" @click="refresh()">重试</StButton>
   </StSpace>
   <StSpace v-else direction="vertical" gap="1.5rem" fill-x class="max-md:!gap-4">
      <h1 class="w-full border-b border-accent-500 pb-4 text-2xl break-words max-md:pb-3 max-md:text-xl">
         {{ section.title }}
      </h1>
      <template v-if="section.type === 'article'">
         <ArticleBody
            :html="html"
            :blocks="blocks"
            class="w-full self-center" />
         <div ref="end" class="h-px w-full" aria-hidden="true"></div>
      </template>
      <p v-else-if="!section.problem" class="text-accent-300">当前题目暂不可用，请稍后再试。</p>
      <template v-else>
         <ArticleBody
            v-if="problemHtml"
            :html="problemHtml"
            class="w-full self-center" />
         <ProblemWorkspace
            :key="section.problem.pid"
            :pid="section.problem.pid"
            :title="section.problem.title"
            @committed="onCommitted" />
      </template>
      <StSpace fill-x align="center" justify="between" gap="1rem" wrap>
         <span v-if="isCompleted" class="inline-flex items-center gap-2 text-sm text-success">
            <CheckOne aria-hidden="true" />
            本节已完成
         </span>
         <span v-else class="text-sm text-accent-300">
            {{ saving ? '正在保存进度…' : section.type === 'article' ? '阅读至文章底部即可完成本节' : '在上方提交并通过判题后自动完成本节' }}
         </span>
         <StButton v-if="saveError && section.type === 'article'" size="sm" bordered :loading="saving" @click="complete(true)">
            重试保存
         </StButton>
         <StButton
            v-if="section.type === 'problem' && section.problem && !isCompleted"
            bordered
            size="sm"
            :disabled="saving || checking"
            class="max-md:w-full max-md:!py-2.5"
            @click="checkStatus">
            <Refresh
               class="mr-2"
               :class="{ 'check-status-spin': checking }"
               @animationend="checking = false" />
            检查通过状态
         </StButton>
      </StSpace>
   </StSpace>
</template>

<style scoped>
.check-status-spin {
   animation: check-status-spin 600ms ease-in-out;
}

@keyframes check-status-spin {
   to {
      transform: rotate(360deg);
   }
}
</style>
