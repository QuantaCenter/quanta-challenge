<script setup lang="ts">
import {
   Delete,
   Plus,
   PreviewOpen,
   Refresh,
   TextWrapOverflow,
   TextWrapTruncation,
} from '@icon-park/vue-next';
import { createLearningPlaygroundDocument } from '~/utils/learning-playground';
import LearningMonacoEditor from '~/components/learning/LearningMonacoEditor.vue';

export interface LearningPlaygroundDraft {
   id?: string;
   title: string;
   html: string;
   css: string;
   js: string;
}

const playgrounds = defineModel<LearningPlaygroundDraft[]>('playgrounds', {
   required: true,
});

const emit = defineEmits<{
   insert: [id: string];
   remove: [id: string];
}>();

const activeId = ref('');
const activeLanguage = ref<'html' | 'css' | 'js'>('html');
const wrapLines = ref(true);
const initialCode = new Map<string, Pick<LearningPlaygroundDraft, 'html' | 'css' | 'js'>>();
const languageTabs = [
   { label: 'HTML', value: 'html' },
   { label: 'CSS', value: 'css' },
   { label: 'JavaScript', value: 'js' },
] as const;

const activePlayground = computed(
   () =>
      playgrounds.value.find((item) => item.id === activeId.value) ??
      playgrounds.value[0],
);

const previewDocument = computed(() => {
   const playground = activePlayground.value;
   if (!playground) return '';
   return createLearningPlaygroundDocument(playground);
});

const addPlayground = () => {
   const id = crypto.randomUUID();
   playgrounds.value = [
      ...playgrounds.value,
      { id, title: '动手试一试', html: '', css: '', js: '' },
   ];
   activeId.value = id;
};

const removePlayground = (id: string) => {
   playgrounds.value = playgrounds.value.filter((item) => item.id !== id);
   emit('remove', id);
   if (activeId.value === id) activeId.value = playgrounds.value[0]?.id ?? '';
};

watch(activePlayground, (playground) => {
   if (playground?.id && !initialCode.has(playground.id)) {
      initialCode.set(playground.id, {
         html: playground.html,
         css: playground.css,
         js: playground.js,
      });
   }
});

const resetPlayground = () => {
   const playground = activePlayground.value;
   const initial = playground?.id ? initialCode.get(playground.id) : undefined;
   if (!playground || !initial) return;
   Object.assign(playground, initial);
};

const activeCode = computed({
   get: () => {
      const playground = activePlayground.value;
      if (!playground) return '';
      return activeLanguage.value === 'html'
         ? playground.html
         : activeLanguage.value === 'css'
           ? playground.css
           : playground.js;
   },
   set: (value: string) => {
      const playground = activePlayground.value;
      if (!playground) return;
      if (activeLanguage.value === 'html') playground.html = value;
      else if (activeLanguage.value === 'css') playground.css = value;
      else playground.js = value;
   },
});

const monacoLanguage = computed(() =>
   activeLanguage.value === 'js' ? 'javascript' as const : activeLanguage.value,
);

watch(
   playgrounds,
   (items) => {
      if (!items.some((item) => item.id === activeId.value)) {
         activeId.value = items[0]?.id ?? '';
      }
   },
   { immediate: true },
);

</script>

<template>
   <StCard class="!h-auto">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
         <div>
            <h2 class="st-font-capture text-lg text-white">Playground</h2>
            <p class="mt-1 text-sm text-accent-300">编辑 HTML、CSS 与 JS，并实时预览运行结果。</p>
         </div>
         <StButton size="sm" bordered @click="addPlayground">
            <Plus class="mr-2" />增加 Playground
         </StButton>
      </div>

      <div v-if="playgrounds.length" class="flex flex-col gap-4">
         <StTabs
            v-model="activeId"
            :options="playgrounds.map((item, index) => ({
               value: item.id ?? '',
               label: item.title || `Playground ${index + 1}`,
            }))" />

         <div v-if="activePlayground" class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-2">
               <StInput
                  v-model:value="activePlayground.title"
                  class="min-w-60 flex-1"
                  outer-class="border border-accent-500 !py-2.5"
                  placeholder="Playground 标题" />
               <StButton
                  size="sm"
                  theme="secondary"
                  @click="activePlayground.id && emit('insert', activePlayground.id)">
                  插入指令
               </StButton>
               <StButton size="sm" bordered @click="wrapLines = !wrapLines">
                  <TextWrapTruncation v-if="wrapLines" class="mr-1" />
                  <TextWrapOverflow v-else class="mr-1" />
                  {{ wrapLines ? '换行' : '不换行' }}
               </StButton>
               <StButton size="sm" bordered @click="resetPlayground">
                  <Refresh class="mr-1" />重置
               </StButton>
               <StButton
                  size="sm"
                  theme="danger"
                  bordered
                  @click="activePlayground.id && removePlayground(activePlayground.id)">
                  <Delete class="mr-1" />删除
               </StButton>
            </div>

            <div class="grid overflow-hidden rounded-xl bg-[#1c1c1c] lg:grid-cols-2">
               <div class="min-w-0 border-accent-500 lg:border-r">
                  <div class="flex h-10 items-center gap-2 bg-accent-600 p-1">
                     <button
                        v-for="tab in languageTabs"
                        :key="tab.value"
                        type="button"
                        class="rounded-[0.375rem] border border-transparent bg-accent-500 px-2 py-1 font-mono text-xs text-accent-200 transition-colors hover:border-primary"
                        :class="
                           activeLanguage === tab.value
                              ? '!bg-primary !text-white'
                              : ''
                        "
                        @click="activeLanguage = tab.value">
                        {{ tab.label }}
                     </button>
                  </div>
                  <LearningMonacoEditor
                     v-model:value="activeCode"
                     :language="monacoLanguage"
                     :word-wrap="wrapLines"
                     height="22rem" />
               </div>
               <div class="flex min-h-[22rem] min-w-0 flex-col bg-white">
                  <div class="flex h-10 shrink-0 items-center gap-2 bg-accent-500 px-3 st-font-caption text-accent-100">
                     <PreviewOpen size="1rem" />实时预览
                  </div>
                  <iframe
                     :key="previewDocument"
                     title="Playground 实时预览"
                     sandbox="allow-scripts"
                     :srcdoc="previewDocument"
                     class="min-h-72 flex-1 w-full bg-white" />
               </div>
            </div>
         </div>
      </div>
      <StEmptyStatus v-else content="暂无 Playground" class="!w-full py-8" />
   </StCard>
</template>
