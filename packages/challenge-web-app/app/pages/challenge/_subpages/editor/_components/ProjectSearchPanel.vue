<script setup lang="ts">
import type { StSearchOverlayQueryInput } from '#components';
import { Replace, ReplaceAll, X } from 'lucide-vue-next';
import { AddText, SettingConfig, CollapseTextInput, ExpandTextInput, RefreshOne } from '@icon-park/vue-next';
import { findNextProjectSearchMatch, MAX_PROJECT_SEARCH_MATCHES, type ProjectMatch, type ProjectReplaceResult, type ProjectSearchCursor, type ProjectSearchPreferences, type ProjectSearchResult } from '~/utils/project-search';
import ProjectSearchResults from './ProjectSearchResults.vue';

const props = defineProps<{
   search: (query: string, signal: AbortSignal, preferences: ProjectSearchPreferences) => Promise<ProjectSearchResult>;
   replace: (result: ProjectSearchResult, replacement: string) => Promise<ProjectReplaceResult>;
}>();
const emit = defineEmits<{ select: [path: string, match: ProjectMatch] }>();
const query = ref('');
const input = ref<InstanceType<typeof StSearchOverlayQueryInput>>();
const result = shallowRef<ProjectSearchResult>({ groups: [], truncated: false, unreadable: 0 });
const busy = ref(false);
const error = ref('');
const replaceOpened = ref(false);
const replacement = ref('');
const replacementInput = ref<HTMLInputElement>();
const replaceId = useId();
const replacing = ref(false);
const replaceStatus = ref('');
let replaceCursor: ProjectSearchCursor | undefined;
const ignoreCase = ref(true);
const respectGitignore = ref(true);
const excludePatterns = ref('');
const ignoreSettingsOpened = ref(false);
const ignoreSettingsId = useId();
const resultsEditor = ref<InstanceType<typeof ProjectSearchResults>>();
const count = computed(() => result.value.groups.reduce((sum, group) => sum + group.matches.length, 0));
let controller: AbortController | undefined;
let disposed = false;

const run = async () => {
   if (disposed || replacing.value) return;
   controller?.abort();
   const request = new AbortController();
   controller = request;
   error.value = '';
   result.value = { groups: [], truncated: false, unreadable: 0 };
   busy.value = !!query.value;
   if (!query.value) return;
   try {
      const found = await props.search(query.value, request.signal, {
         ignoreCase: ignoreCase.value,
         respectGitignore: respectGitignore.value,
         excludePatterns: excludePatterns.value,
      });
      if (!request.signal.aborted) result.value = found;
   } catch {
      if (!request.signal.aborted) error.value = '搜索失败，请检查运行环境后重试';
   } finally {
      if (!request.signal.aborted) busy.value = false;
   }
};
const debouncedRun = useDebounceFn(run, 200);
watch([query, ignoreCase, respectGitignore, excludePatterns], () => {
   controller?.abort();
   result.value = { groups: [], truncated: false, unreadable: 0 };
   busy.value = !!query.value;
   error.value = '';
   replaceStatus.value = '';
   replaceCursor = undefined;
   debouncedRun();
});
onUnmounted(() => {
   disposed = true;
   controller?.abort();
});
defineExpose({ focus: () => input.value?.focus() });

const toggleReplace = async () => {
   replaceOpened.value = !replaceOpened.value;
   await nextTick();
   if (replaceOpened.value) replacementInput.value?.focus();
   else input.value?.focus();
};
const replaceMatches = async (all: boolean) => {
   if (busy.value || replacing.value || !count.value || (all && result.value.truncated)) return;
   const next = findNextProjectSearchMatch(result.value, replaceCursor);
   if (!next) return;
   const snapshot = all ? result.value : {
      ...result.value,
      groups: [{ ...next.group, matches: [next.match] }],
      truncated: false,
   };
   replacing.value = true;
   replaceStatus.value = '';
   try {
      const summary = await props.replace(snapshot, replacement.value);
      if (all) replaceCursor = undefined;
      else if (!summary.skipped && !summary.failed) {
         const lines = replacement.value.split('\n');
         replaceCursor = {
            path: next.group.path,
            line: next.match.line + lines.length - 1,
            column: lines.length > 1 ? lines.at(-1)!.length + 1 : next.match.column + replacement.value.length,
         };
      }
      replaceStatus.value = `已替换 ${summary.matches} 处，涉及 ${summary.files} 个文件`;
      if (summary.skipped) replaceStatus.value += `；${summary.skipped} 个文件已变化，已跳过`;
      if (summary.failed) replaceStatus.value += `；${summary.failed} 个文件替换失败`;
   } catch {
      replaceStatus.value = '替换失败，请重新搜索后重试';
   } finally {
      replacing.value = false;
      await run();
      if (!disposed && replaceOpened.value) replacementInput.value?.focus();
   }
};
const replaceNext = () => replaceMatches(false);
const replaceAll = () => replaceMatches(true);
const selectMatch = (path: string, match: ProjectMatch) => {
   replaceCursor = { path, line: match.line, column: match.column };
   emit('select', path, match);
};

const toolbarActions = [
   { label: '全部折叠', icon: CollapseTextInput, run: () => resultsEditor.value?.foldAll() },
   { label: '全部展开', icon: ExpandTextInput, run: () => resultsEditor.value?.unfoldAll() },
   { label: '重新搜索', icon: RefreshOne, run },
];
</script>

<template>
   <section class="size-full flex flex-col bg-accent-700 text-accent-100" aria-label="项目全局搜索">
      <fieldset :disabled="replacing" class="flex flex-col gap-2 pb-2 shrink-0 min-w-0">
         <StSearchOverlayQueryInput
            ref="input"
            v-model="query"
            variant="integrated"
            :busy="busy"
            placeholder="在项目所有文本文件中搜索…"
            @keydown.enter="run" />
         <div v-if="replaceOpened" :id="replaceId" class="flex items-center h-9 gap-2 px-3 bg-accent-600/50">
            <ReplaceAll :size="16" class="shrink-0 text-accent-300" />
            <input
               ref="replacementInput"
               v-model="replacement"
               type="text"
               aria-label="替换为"
               placeholder="替换为…（留空则删除匹配内容）"
               :disabled="replacing"
               class="flex-1 min-w-0 bg-transparent border-none outline-none text-sm placeholder:text-accent-300"
               @keydown.enter.exact.prevent="replaceNext"
               @keydown.ctrl.enter.prevent="replaceAll"
               @keydown.meta.enter.prevent="replaceAll"
               @keydown.esc.prevent="toggleReplace" />
            <StPopover content="替换下一个（Enter）" placement="bottom">
               <StButton
                  size="sm"
                  aria-label="替换下一个"
                  class="!p-0 !size-7 !bg-transparent hover:!bg-accent-600 !text-accent-300 shrink-0"
                  :disabled="busy || replacing || !count"
                  @click="replaceNext">
                  <Replace :size="16" />
               </StButton>
            </StPopover>
            <StPopover content="全部替换（Ctrl / ⌘ + Enter）" placement="bottom">
               <StButton
                  size="sm"
                  aria-label="全部替换"
                  class="!p-0 !size-7 !bg-transparent hover:!bg-accent-600 !text-accent-300 shrink-0"
                  :disabled="busy || replacing || !count || result.truncated"
                  @click="replaceAll">
                  <ReplaceAll :size="16" />
               </StButton>
            </StPopover>
            <span v-if="replacing" role="status" class="sr-only">正在替换…</span>
            <button type="button" aria-label="关闭替换栏" class="p-1 text-accent-300 hover:text-white" @click="toggleReplace">
               <X :size="16" />
            </button>
         </div>
         <p v-if="replaceStatus" role="status" aria-live="polite" class="px-3 text-xs text-accent-300">{{ replaceStatus }}</p>
         <p v-if="replaceOpened && result.truncated" class="px-3 text-xs text-accent-300">匹配过多，请缩小搜索范围后再全部替换。</p>
         <div class="flex flex-wrap items-center justify-between gap-2 px-3 text-xs text-accent-300">
            <span role="status" aria-live="polite">
               {{ busy ? '正在搜索…' : error || (query ? `${count} 处匹配，${result.groups.length} 个文件` : '输入关键词开始搜索') }}
            </span>
            <div class="flex items-center gap-1">
               <StPopover content="全局替换" placement="bottom">
                  <StButton
                     size="sm"
                     aria-label="全局替换"
                     :aria-expanded="replaceOpened"
                     :aria-controls="replaceId"
                     class="!p-0 !size-7 !bg-transparent hover:!bg-accent-600"
                     :class="{ '!text-primary': replaceOpened }"
                     @click="toggleReplace">
                     <ReplaceAll :size="16" />
                  </StButton>
               </StPopover>
               <StPopover :content="ignoreCase ? '忽略大小写（已开启）' : '忽略大小写（已关闭）'" placement="bottom">
                  <StButton
                     size="sm"
                     aria-label="忽略大小写"
                     :aria-pressed="ignoreCase"
                     class="!p-0 !size-7 !bg-transparent hover:!bg-accent-600"
                     :class="ignoreCase ? '!text-primary' : '!text-accent-300'"
                     @click="ignoreCase = !ignoreCase">
                     <AddText :size="16" />
                  </StButton>
               </StPopover>
               <StPopover content="搜索忽略设置" placement="bottom">
                  <StButton
                     size="sm"
                     aria-label="搜索忽略设置"
                     :aria-expanded="ignoreSettingsOpened"
                     :aria-controls="ignoreSettingsId"
                     class="!p-0 !size-7 !bg-transparent hover:!bg-accent-600"
                     :class="{ '!text-primary': ignoreSettingsOpened }"
                     @click="ignoreSettingsOpened = !ignoreSettingsOpened">
                     <SettingConfig :size="16" />
                  </StButton>
               </StPopover>
               <StPopover v-for="action in toolbarActions" :key="action.label" :content="action.label" placement="bottom">
                  <StButton
                     size="sm"
                     :aria-label="action.label"
                     class="!p-0 !size-7 !bg-transparent hover:!bg-accent-600 !text-accent-300"
                     @click="action.run">
                     <component :is="action.icon" :size="16" />
                  </StButton>
               </StPopover>
            </div>
         </div>
         <div v-if="ignoreSettingsOpened" :id="ignoreSettingsId" class="mx-3 p-3 flex flex-col gap-3 bg-accent-600/50 text-xs">
            <div class="flex items-center justify-between gap-3">
               <span>使用工作目录的 .gitignore</span>
               <StSwitch v-model="respectGitignore" aria-label="使用工作目录的 .gitignore" />
            </div>
            <label class="flex flex-col gap-2 text-accent-300">
               额外排除规则（每行一条，支持 .gitignore 语法）
               <textarea
                  v-model="excludePatterns"
                  rows="3"
                  aria-label="额外排除规则"
                  placeholder="例如：node_modules/ 或 *.log"
                  class="w-full resize-y bg-accent-700 p-2 rounded outline-none focus-visible:ring-1 focus-visible:ring-primary font-mono" />
            </label>
         </div>
      </fieldset>
      <div class="flex-1 min-h-0 relative">
         <StEmptyStatus v-if="!busy && query && !error && !count" content="未找到匹配内容" />
         <ProjectSearchResults
            v-show="count > 0"
            ref="resultsEditor"
            class="absolute inset-0"
            :groups="result.groups"
            @select="selectMatch" />
      </div>
      <p v-if="result.truncated" class="text-xs text-accent-300 px-3 py-2">仅显示前 {{ MAX_PROJECT_SEARCH_MATCHES.toLocaleString() }} 处匹配，请缩小搜索范围。</p>
      <p v-if="result.unreadable" class="text-xs text-accent-300 px-3 py-2">{{ result.unreadable }} 个文件读取失败，请重新搜索。</p>
   </section>
</template>
