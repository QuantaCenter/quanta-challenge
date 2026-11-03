<script setup lang="ts">
import { CheckOne, ArrowRight, Refresh } from '@icon-park/vue-next';
import ArticleBody from './ArticleBody.vue';
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
const { html, update } = useMarkdown({ codeHeader: true });
watch(() => section.value?.articleContent, content => update(content ?? ''), { immediate: true });
const end = useTemplateRef('end');
const reachedEnd = ref(false);
const saving = ref(false);
const saved = ref(false);
const saveError = ref(false);
const isCompleted = computed(() => props.completed || saved.value);
let observer: IntersectionObserver | undefined;

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
onMounted(() => {
   observeEnd();
   window.addEventListener('focus', onFocus);
   if (section.value?.type === 'problem') void complete();
});
onBeforeUnmount(() => {
   observer?.disconnect();
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
   <StSpace v-else direction="vertical" gap="1.5rem" fill-x>
      <h1
         class="text-2xl"
         :class="{ 'w-full border-b border-accent-500 pb-4': section.type === 'article' }">
         {{ section.title }}
      </h1>
      <template v-if="section.type === 'article'">
         <ArticleBody :html="html" class="w-full max-w-[52rem] self-center" />
         <div ref="end" class="h-px w-full" aria-hidden="true"></div>
      </template>
      <StSpace v-else direction="vertical" gap="1rem" fill-x>
         <p class="leading-relaxed text-accent-300">
            在做题页完成练习，通过判题后回到这里继续学习。
         </p>
         <p v-if="!section.problem" class="text-accent-300">当前题目暂不可用，请稍后再试。</p>
         <template v-else>
            <h2 class="text-lg">{{ section.problem.title }}</h2>
            <NuxtLink
               :to="`/challenge/editor/${section.problem.pid}`"
               target="_blank"
               rel="noopener"
               class="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm text-white transition-opacity hover:opacity-80">
               前往做题
               <ArrowRight aria-hidden="true" />
            </NuxtLink>
         </template>
         <StButton v-if="!isCompleted" bordered size="sm" :loading="saving" @click="complete(true)">
            <Refresh class="mr-2" />
            检查通过状态
         </StButton>
      </StSpace>
      <StSpace fill-x align="center" justify="between" gap="1rem" wrap>
         <span v-if="isCompleted" class="inline-flex items-center gap-2 text-sm text-success">
            <CheckOne aria-hidden="true" />
            本节已完成
         </span>
         <span v-else class="text-sm text-accent-300">
            {{ saving ? '正在保存进度…' : section.type === 'article' ? '阅读至文章底部即可完成本节' : '通过题目后完成本节' }}
         </span>
         <StButton v-if="saveError && section.type === 'article'" size="sm" bordered :loading="saving" @click="complete(true)">
            重试保存
         </StButton>
      </StSpace>
   </StSpace>
</template>
