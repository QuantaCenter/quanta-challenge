<script setup lang="ts">
import {
   PreviewOpen,
   Refresh,
   TextWrapOverflow,
   TextWrapTruncation,
} from '@icon-park/vue-next';
import { createLearningPlaygroundDocument } from '~/utils/learning-playground';
import LearningMonacoEditor from './LearningMonacoEditor.vue';

const props = defineProps<{
   title: string;
   html: string;
   css: string;
   js: string;
}>();

const html = ref(props.html);
const css = ref(props.css);
const js = ref(props.js);
const active = ref<'html' | 'css' | 'js'>('html');
const wrapLines = ref(true);
const previewDocument = ref('');
let updateTimer: ReturnType<typeof setTimeout> | undefined;

const schedulePreview = () => {
   if (updateTimer) clearTimeout(updateTimer);
   updateTimer = setTimeout(() => {
      previewDocument.value = createLearningPlaygroundDocument({
         html: html.value,
         css: css.value,
         js: js.value,
      });
   }, 300);
};

watch([html, css, js], schedulePreview, { immediate: true });

const reset = () => {
   html.value = props.html;
   css.value = props.css;
   js.value = props.js;
};

onBeforeUnmount(() => {
   if (updateTimer) clearTimeout(updateTimer);
});

const tabs = [
   { value: 'html', label: 'HTML' },
   { value: 'css', label: 'CSS' },
   { value: 'js', label: 'JavaScript' },
] as const;

const activeCode = computed({
   get: () =>
      active.value === 'html'
         ? html.value
         : active.value === 'css'
           ? css.value
           : js.value,
   set: (value: string) => {
      if (active.value === 'html') html.value = value;
      else if (active.value === 'css') css.value = value;
      else js.value = value;
   },
});

const activeLanguage = computed(() =>
   active.value === 'js' ? 'javascript' as const : active.value,
);
</script>

<template>
   <section class="my-8 w-full overflow-hidden rounded-xl bg-accent-600 p-2">
      <header class="flex min-h-12 flex-wrap items-center justify-between gap-3 px-2 pb-2">
         <h3 class="min-w-0 truncate st-font-body-bold text-white">
            {{ title || '动手试一试' }}
         </h3>
         <StSpace align="center" gap="0.25rem">
            <StPopover :content="wrapLines ? '改为不换行' : '改为自动换行'">
               <button
                  type="button"
                  :aria-label="wrapLines ? '改为不换行' : '改为自动换行'"
                  class="flex h-8 items-center gap-1.5 rounded-lg px-2.5 st-font-caption text-accent-200 transition-colors hover:bg-accent-500 hover:text-white"
                  @click="wrapLines = !wrapLines">
                  <TextWrapTruncation v-if="wrapLines" size="1rem" />
                  <TextWrapOverflow v-else size="1rem" />
                  {{ wrapLines ? '换行' : '不换行' }}
               </button>
            </StPopover>
            <button
               type="button"
               class="flex h-8 items-center gap-1.5 rounded-lg px-2.5 st-font-caption text-accent-200 transition-colors hover:bg-accent-500 hover:text-white"
               @click="reset">
               <Refresh size="1rem" />重置
            </button>
         </StSpace>
      </header>

      <div class="grid overflow-hidden rounded-lg bg-[#1c1c1c] lg:grid-cols-2">
         <div class="min-w-0 border-accent-500 lg:border-r">
            <div class="flex h-10 items-center gap-2 bg-accent-600 p-1">
               <button
                  v-for="tab in tabs"
                  :key="tab.value"
                  type="button"
                  class="rounded-[0.375rem] border border-transparent bg-accent-500 px-2 py-1 font-mono text-xs text-accent-200 transition-colors hover:border-primary"
                  :class="
                     active === tab.value
                        ? '!bg-primary !text-white'
                        : ''
                  "
                  @click="active = tab.value">
                  {{ tab.label }}
               </button>
            </div>
            <LearningMonacoEditor
               v-model:value="activeCode"
               :language="activeLanguage"
               :word-wrap="wrapLines"
               height="22rem" />
         </div>
         <div class="flex min-h-[22rem] min-w-0 flex-col bg-white">
            <div class="flex h-10 shrink-0 items-center gap-2 bg-accent-500 px-3 st-font-caption text-accent-100">
               <PreviewOpen size="1rem" />
               <span>实时预览</span>
            </div>
            <iframe
               title="Playground 实时预览"
               sandbox="allow-scripts"
               :srcdoc="previewDocument"
               class="min-h-72 flex-1 w-full bg-white" />
         </div>
      </div>
   </section>
</template>
