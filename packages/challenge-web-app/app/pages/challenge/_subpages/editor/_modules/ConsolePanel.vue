<script setup lang="ts">
import { Clear, Close, CloseOne, Attention, RightSmall, LeftSmall } from '@icon-park/vue-next';
import ConsoleValue from '../_components/ConsoleValue.vue';
import type { IPreviewConsoleEntry } from '../_composables/use-preview-console';
import { toDisplayText } from '../_utils/preview-url';

const props = defineProps<{
   entries: IPreviewConsoleEntry[];
   ready: boolean;
   counts: { errors: number; warnings: number };
}>();

const emits = defineEmits<{
   (e: 'execute', code: string): void;
   (e: 'clear'): void;
   (e: 'close'): void;
}>();

const filterText = ref('');
const levelFilter = ref<'error' | 'warn' | null>(null);
const toggleLevelFilter = (level: 'error' | 'warn') => {
   levelFilter.value = levelFilter.value === level ? null : level;
};
const visibleEntries = computed(() => {
   const query = filterText.value.trim().toLowerCase();
   const level = levelFilter.value;
   if (!query && !level) return props.entries;
   return props.entries.filter(
      (entry) =>
         (!level || (entry.kind !== 'input' && entry.level === level)) &&
         (!query ||
            (entry.code ?? JSON.stringify(entry.args)).toLowerCase().includes(query)),
   );
});

const LEVEL_CLASS: Record<string, string> = {
   error: 'bg-red-500/10 text-red-300 border-red-500/20',
   warn: 'bg-yellow-500/10 text-yellow-200 border-yellow-500/20',
   info: 'text-accent-100 border-accent-600',
   debug: 'text-accent-300 border-accent-600',
   log: 'text-accent-100 border-accent-600',
};

const listRef = useTemplateRef<HTMLElement>('list');
const stickToBottom = ref(true);
const onListScroll = () => {
   const el = listRef.value;
   if (!el) return;
   stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
};
const scrollToBottom = () => {
   const el = listRef.value;
   if (el) el.scrollTop = el.scrollHeight;
};
watch(
   () => props.entries,
   () => {
      if (stickToBottom.value) nextTick(scrollToBottom);
   },
);
onMounted(scrollToBottom);

const inputRef = useTemplateRef<HTMLTextAreaElement>('input');
const code = ref('');
const history = ref<string[]>([]);
const historyIndex = ref(0);
let draft = '';

const autoResize = () => {
   const el = inputRef.value;
   if (!el) return;
   el.style.height = 'auto';
   el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
};
watch(code, () => nextTick(autoResize));

const submit = () => {
   const text = code.value;
   if (!text.trim() || !props.ready) return;
   emits('execute', text);
   if (history.value.at(-1) !== text) history.value.push(text);
   historyIndex.value = history.value.length;
   draft = '';
   code.value = '';
   stickToBottom.value = true;
};

const recall = (index: number) => {
   if (historyIndex.value === history.value.length) draft = code.value;
   historyIndex.value = index;
   code.value = index === history.value.length ? draft : history.value[index]!;
   nextTick(() => {
      const el = inputRef.value;
      el?.setSelectionRange(el.value.length, el.value.length);
   });
};

const onKeydown = (event: KeyboardEvent) => {
   const el = event.target as HTMLTextAreaElement;
   if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
      return;
   }
   if (event.key === 'ArrowUp' && !el.value.slice(0, el.selectionStart).includes('\n')) {
      if (historyIndex.value === 0) return;
      event.preventDefault();
      recall(historyIndex.value - 1);
      return;
   }
   if (event.key === 'ArrowDown' && !el.value.slice(el.selectionEnd).includes('\n')) {
      if (historyIndex.value >= history.value.length) return;
      event.preventDefault();
      recall(historyIndex.value + 1);
   }
   if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault();
      emits('clear');
   }
};

const focusInput = () => {
   if (window.getSelection()?.toString()) return;
   inputRef.value?.focus();
};
</script>

<template>
   <StSpace fill direction="vertical" gap="0" class="bg-[#181818] rounded-xl overflow-hidden border border-accent-600">
      <StSpace fill-x no-shrink gap="0" class="p-1 bg-accent-600">
         <StSpace fill-x align="center" justify="between" gap="0.5rem"
            class="h-[2.15rem] px-1 text-accent-200">
            <StSpace align="center" gap="0.5rem" class="min-w-0 text-xs">
               <span class="text-sm font-medium text-accent-100 shrink-0">控制台</span>
               <StSpace v-if="counts.errors || levelFilter === 'error'" align="center" gap="0.25rem"
                  :title="levelFilter === 'error' ? '显示全部输出' : '只看错误'"
                  class="shrink-0 h-[1.25rem] px-1.5 rounded-[0.375rem] text-red-300 cursor-pointer transition-colors border"
                  :class="levelFilter === 'error'
                     ? 'bg-red-500/30 border-red-400/60'
                     : 'bg-red-500/15 border-transparent hover:bg-red-500/25'"
                  @click="toggleLevelFilter('error')">
                  <CloseOne />
                  <span>{{ counts.errors }}</span>
               </StSpace>
               <StSpace v-if="counts.warnings || levelFilter === 'warn'" align="center" gap="0.25rem"
                  :title="levelFilter === 'warn' ? '显示全部输出' : '只看警告'"
                  class="shrink-0 h-[1.25rem] px-1.5 rounded-[0.375rem] text-yellow-200 cursor-pointer transition-colors border"
                  :class="levelFilter === 'warn'
                     ? 'bg-yellow-500/30 border-yellow-400/60'
                     : 'bg-yellow-500/15 border-transparent hover:bg-yellow-500/25'"
                  @click="toggleLevelFilter('warn')">
                  <Attention />
                  <span>{{ counts.warnings }}</span>
               </StSpace>
            </StSpace>
            <StSpace align="center" gap="0.25rem" no-shrink>
               <input v-model="filterText" spellcheck="false" placeholder="过滤"
                  class="w-[8rem] h-[1.65rem] px-2 rounded-[0.375rem] bg-accent-500 outline-none text-xs placeholder:text-accent-300" />
               <StSpace title="清空控制台 (Ctrl+L)"
                  class="p-[0.325rem] rounded-[0.375rem] bg-accent-500 hover:bg-accent-400 transition-colors text-accent-200 cursor-pointer"
                  @click="emits('clear')">
                  <Clear />
               </StSpace>
               <StSpace title="隐藏控制台"
                  class="p-[0.325rem] rounded-[0.375rem] bg-accent-500 hover:bg-accent-400 transition-colors text-accent-200 cursor-pointer"
                  @click="emits('close')">
                  <Close />
               </StSpace>
            </StSpace>
         </StSpace>
      </StSpace>

      <div ref="list" class="w-full flex-1 min-h-0 overflow-auto mini-scrollbar font-mono text-xs leading-5"
         @scroll="onListScroll" @click="focusInput">
         <div v-for="entry in visibleEntries" :key="entry.id"
            class="flex items-start gap-2 px-3 py-0.5 border-b select-text"
            :class="entry.kind === 'input' ? 'text-accent-100 border-accent-600' : LEVEL_CLASS[entry.level]">
            <span class="shrink-0 flex items-center justify-center w-3 h-5 text-accent-300">
               <RightSmall v-if="entry.kind === 'input'" class="inline-block" />
               <LeftSmall v-else-if="entry.kind === 'result'" class="inline-block" />
               <CloseOne v-else-if="entry.level === 'error'" class="inline-block text-red-300" />
               <Attention v-else-if="entry.level === 'warn'" class="inline-block text-yellow-200" />
            </span>
            <div class="flex-1 min-w-0 break-words">
               <pre v-if="entry.kind === 'input'" class="whitespace-pre-wrap font-mono">{{ entry.code }}</pre>
               <template v-else>
                  <span v-if="entry.kind === 'result' && entry.level === 'error'">Uncaught </span>
                  <template v-for="(arg, idx) in entry.args" :key="idx">
                     <ConsoleValue :value="arg" :top="entry.kind === 'log' || arg.t === 'error'" />{{ idx < entry.args.length - 1 ? ' ' : '' }}
                  </template>
                  <pre v-if="entry.stack" class="whitespace-pre-wrap font-mono text-accent-300">{{ toDisplayText(entry.stack) }}</pre>
               </template>
            </div>
            <span v-if="entry.repeat > 1"
               class="shrink-0 mt-0.5 px-1.5 rounded-full bg-accent-500 text-accent-100 text-[0.65rem] leading-4">
               {{ entry.repeat }}
            </span>
         </div>
         <div v-if="!visibleEntries.length" class="px-3 py-2 text-accent-400">
            {{ filterText || levelFilter ? '没有匹配的输出' : '暂无输出' }}
         </div>
      </div>

      <StSpace fill-x align="start" gap="0.5rem" no-shrink
         class="px-3 py-1.5 border-t border-accent-600 font-mono text-xs">
         <RightSmall class="shrink-0 mt-[0.2rem] text-secondary" />
         <textarea ref="input" v-model="code" rows="1" spellcheck="false" :disabled="!ready"
            :placeholder="ready ? '在预览页中执行 JavaScript（Enter 执行，Shift+Enter 换行）' : '等待预览页面加载…'"
            class="flex-1 min-w-0 resize-none bg-transparent outline-none text-accent-100 leading-5 placeholder:text-accent-400 disabled:cursor-not-allowed"
            @keydown="onKeydown" />
      </StSpace>
   </StSpace>
</template>
