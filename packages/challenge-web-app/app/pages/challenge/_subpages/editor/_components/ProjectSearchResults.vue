<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next';
import type { editor } from 'monaco-editor';
import FileIcon from '~/components/st/FileSystemTree/FileIcon.vue';
import { MAX_PROJECT_SEARCH_MATCHES, type ProjectMatch, type ProjectSearchResult } from '~/utils/project-search';
import {
   buildSearchResultDocument,
   getSearchSourceLanguage,
   registerSearchResultFolding,
   SEARCH_RESULTS_LANGUAGE,
   setSearchResultDocument,
} from '~/utils/search-result-document';

const props = defineProps<{ groups: ProjectSearchResult['groups'] }>();
const emit = defineEmits<{ select: [path: string, match: ProjectMatch] }>();
const document = computed(() => buildSearchResultDocument(props.groups));
const fileCounts = computed(() => new Map(props.groups.map((group) => [group.path, group.matches.length])));
const sourceGroups = computed(() => new Map(props.groups.map((group) => [group.path, group])));
const fileFolds = computed(() => new Map(document.value.folds.map((fold) => [fold.start, fold])));
interface FileHeader {
   line: number;
   path: string;
   top: number;
   collapsed: boolean;
   sticky: boolean;
}
const visibleHeaders = shallowRef<FileHeader[]>([]);
const headerWidth = ref(0);
const headerHost = shallowRef<HTMLElement>();
const languageId = `${SEARCH_RESULTS_LANGUAGE}-${useId().replace(/\W/g, '')}`;
const { containerKey, onEditorReady, onBeforeEditorDisposed, setEditorContent } = useSimpleEditor({
   script: '',
   language: languageId,
   containerRef: 'search-results-editor',
   options: {
      readOnly: true,
      domReadOnly: true,
      ariaLabel: '全局搜索结果，文件名可折叠，按回车打开匹配位置',
      fontSize: 13,
      lineHeight: 24,
      fontFamily: 'FiraCode Nerd Font Mono, monospace',
      lineNumbers: (line) => document.value.rows.get(line)?.sourceLine.toString() ?? '',
      lineNumbersMinChars: 4,
      minimap: { enabled: false },
      folding: true,
      foldingMaximumRegions: MAX_PROJECT_SEARCH_MATCHES,
      foldingStrategy: 'auto',
      showFoldingControls: 'never',
      stickyScroll: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      renderLineHighlight: 'none',
      occurrencesHighlight: 'off',
      selectionHighlight: false,
      matchBrackets: 'never',
      contextmenu: false,
      padding: { top: 4, bottom: 4 },
   },
});

let instance: editor.IStandaloneCodeEditor | undefined;
let decorations: editor.IEditorDecorationsCollection | undefined;
let monacoApi: typeof import('monaco-editor') | undefined;
let tokenizer: ReturnType<typeof registerSearchResultFolding> | undefined;
let headerWidget: editor.IOverlayWidget | undefined;
let revision = 0;
let disposed = false;
const sourceTokens = new Map<string, { offset: number; type: string }[][]>();
const highlighting = new Set<string>();

const ensureSourceTokens = async (path: string) => {
   if (!monacoApi || disposed || highlighting.has(path) || sourceTokens.has(path)) return;
   const group = sourceGroups.value.get(path);
   if (!group) return;
   const current = revision;
   highlighting.add(path);
   try {
      const language = getSearchSourceLanguage(monacoApi, path);
      await monacoApi.editor.colorize('', language, {});
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (disposed || current !== revision) return;
      let source = group.source;
      if (source === undefined) {
         const lines: string[] = [];
         for (const match of group.matches) lines[match.line - 1] = `${match.before}${match.match}${match.after}`;
         source = lines.join('\n');
      }
      // Tokenize the original file, including offscreen context. Vue script/style
      // sections and multiline strings/comments retain the same syntax as the IDE.
      sourceTokens.set(path, monacoApi.editor.tokenize(source, language));
      if (sourceTokens.size > 12) sourceTokens.delete(sourceTokens.keys().next().value!);
      tokenizer?.refreshTokens();
   } catch {
      if (!disposed && current === revision) sourceTokens.set(path, []);
   } finally {
      if (current === revision) highlighting.delete(path);
   }
};

// Render headers across the entire viewport, including the line-number gutter.
// Only visible headers and the current file's pinned header have DOM nodes.
const updateViewport = () => {
   if (!instance) return;
   const visibleRanges = instance.getVisibleRanges();
   const headers = new Map<number, string>();
   const visibleSources = new Set<string>();
   for (const range of visibleRanges) {
      for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
         const path = document.value.headers.get(line);
         if (path) headers.set(line, path);
         const row = document.value.rows.get(line);
         if (row) visibleSources.add(row.path);
      }
   }
   for (const path of visibleSources) void ensureSourceTokens(path);
   const scrollTop = instance.getScrollTop();
   const layout = instance.getLayoutInfo();
   headerWidth.value = layout.width - layout.verticalScrollbarWidth;
   const createHeader = (line: number, path: string, top: number, sticky = false): FileHeader => {
      const fold = fileFolds.value.get(line);
      const collapsed = !!fold && instance!.getTopForLineNumber(fold.start) === instance!.getTopForLineNumber(fold.start + 1);
      return { line, path, top, collapsed, sticky };
   };
   const nextHeaders = [...headers].map(([line, path]) =>
      createHeader(line, path, instance!.getTopForLineNumber(line) - scrollTop),
   ).filter((header) => header.top >= 0 && header.top < layout.height);

   const firstLine = visibleRanges[0]?.startLineNumber;
   if (firstLine !== undefined) {
      const folds = document.value.folds;
      let low = 0;
      let high = folds.length - 1;
      let active = -1;
      while (low <= high) {
         const middle = (low + high) >> 1;
         if (folds[middle].start <= firstLine) {
            active = middle;
            low = middle + 1;
         } else high = middle - 1;
      }
      const fold = folds[active];
      const next = folds[active + 1];
      if (fold && (firstLine <= fold.end || (next && firstLine < next.start)) && instance.getTopForLineNumber(fold.start) < scrollTop) {
         const top = next ? Math.min(0, instance.getTopForLineNumber(next.start) - scrollTop - 24) : 0;
         nextHeaders.push(createHeader(fold.start, document.value.headers.get(fold.start)!, top, true));
      }
   }
   visibleHeaders.value = nextHeaders;
};

const refresh = () => {
   const model = instance?.getModel();
   if (!model) return;
   revision++;
   sourceTokens.clear();
   highlighting.clear();
   visibleHeaders.value = [];
   setSearchResultDocument(model, document.value);
   setEditorContent(document.value.text);
   decorations?.set([
      ...[...document.value.headers.keys()].map((line) => ({
         range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: model.getLineMaxColumn(line) },
         options: {
            isWholeLine: true,
            className: 'project-search-file-header',
            marginClassName: 'project-search-file-header-margin',
            inlineClassName: 'project-search-file-heading-text',
         },
      })),
      ...[...document.value.rows].flatMap(([line, row]) => row.hits.map(({ match, column }) => ({
         range: {
            startLineNumber: line,
            startColumn: column,
            endLineNumber: line,
            endColumn: column + match.length,
         },
         options: {
            inlineClassName: 'project-search-match',
            hoverMessage: { value: `第 ${match.line} 行，第 ${match.column} 列 · 点击打开文件` },
         },
      }))),
   ]);
   let numberColumns = 4;
   for (const row of document.value.rows.values()) {
      numberColumns = Math.max(numberColumns, row.sourceLine.toString().length);
   }
   instance?.updateOptions({
      lineNumbers: (line) => document.value.rows.get(line)?.sourceLine.toString() ?? '',
      lineNumbersMinChars: numberColumns,
   });
   tokenizer?.refreshTokens();
   updateViewport();
};

const activateLine = (line: number, column = 1) => {
   const row = document.value.rows.get(line);
   if (row) {
      const hit = row.hits.find((hit) => column >= hit.column && column < hit.column + hit.match.length) ?? row.hits[0];
      emit('select', row.path, hit?.match ?? { line: row.sourceLine, column: 1, length: 0, before: '', match: '', after: '' });
   } else if (document.value.headers.has(line)) {
      instance?.setPosition({ lineNumber: line, column: 1 });
      void instance?.getAction('editor.toggleFold')?.run();
   }
};

onEditorReady((editor, monaco) => {
   instance = editor;
   monacoApi = monaco;
   // Keep headers inside Monaco's DOM so wheel events bubble to its native
   // scroll handler, including when a sticky header moves under the pointer.
   const host = editor.getDomNode()!.ownerDocument.createElement('div');
   headerWidget = {
      getId: () => `${languageId}-headers`,
      getDomNode: () => host,
      getPosition: () => ({ preference: { top: 0, left: 0 } }),
   };
   editor.addOverlayWidget(headerWidget);
   headerHost.value = host;
   tokenizer = registerSearchResultFolding(monaco, languageId, (line) => {
      const row = document.value.rows.get(line);
      return row ? (sourceTokens.get(row.path)?.[row.sourceLine - 1] ?? [])
         .map((token) => ({ startIndex: token.offset, scopes: token.type })) : [];
   });
   monaco.editor.setModelLanguage(editor.getModel()!, languageId);
   decorations = editor.createDecorationsCollection();
   editor.onDidScrollChange(updateViewport);
   editor.onDidChangeHiddenAreas(updateViewport);
   editor.onDidLayoutChange(updateViewport);
   editor.onMouseUp((event) => {
      if (!event.event.leftButton || !editor.getSelection()?.isEmpty()) return;
      if (event.target.position && (
         event.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT ||
         (event.target.type === monaco.editor.MouseTargetType.CONTENT_EMPTY && document.value.headers.has(event.target.position.lineNumber))
      )) {
         activateLine(event.target.position.lineNumber, event.target.position.column);
      }
   });
   editor.addAction({
      id: 'project-search.open-result',
      label: '打开搜索结果',
      keybindings: [monaco.KeyCode.Enter],
      run: () => activateLine(editor.getPosition()?.lineNumber ?? 0, editor.getPosition()?.column),
   });
   refresh();
});
watch(document, refresh);
onBeforeEditorDisposed((editor) => {
   disposed = true;
   revision++;
   visibleHeaders.value = [];
   headerHost.value = undefined;
   if (headerWidget) editor?.removeOverlayWidget(headerWidget);
   decorations?.clear();
   editor?.getModel()?.dispose();
   tokenizer?.dispose();
   sourceTokens.clear();
   instance = undefined;
});
defineExpose({
   foldAll: () => instance?.getAction('editor.foldAll')?.run(),
   unfoldAll: () => instance?.getAction('editor.unfoldAll')?.run(),
});
</script>

<template>
   <div class="relative size-full min-h-0 overflow-hidden">
      <div :ref="containerKey" class="size-full" />
      <Teleport v-if="headerHost" :to="headerHost">
         <button
            v-for="header in visibleHeaders"
            :key="header.line"
            type="button"
            class="project-search-header absolute left-0 flex items-center gap-2 h-6 px-2 overflow-hidden text-left text-xs text-accent-100"
            :class="header.sticky ? 'z-20 shadow-md' : 'z-10'"
            :style="{ top: header.top + 'px', width: headerWidth + 'px' }"
            :aria-label="`${header.collapsed ? '展开' : '折叠'} ${header.path}`"
            :aria-expanded="!header.collapsed"
            @click="activateLine(header.line)">
            <ChevronRight
               :size="14"
               class="shrink-0 transition-transform"
               :class="{ 'rotate-90': !header.collapsed }" />
            <FileIcon :name="header.path" aria-hidden="true" />
            <span class="shrink-0 font-medium">{{ header.path.split('/').at(-1) }}</span>
            <span class="truncate min-w-0 text-accent-300">{{ header.path.replace(/^\/project\//, '').replace(/[^/]+$/, '') }}</span>
            <span class="shrink-0 text-accent-400 ml-auto pr-1">{{ fileCounts.get(header.path) }} 处匹配</span>
         </button>
      </Teleport>
   </div>
</template>

<style scoped>
:deep(.project-search-match) {
   background: color-mix(in srgb, var(--color-primary) 25%, transparent);
   outline: 1px solid color-mix(in srgb, var(--color-primary) 50%, transparent);
   border-radius: 2px;
}
:deep(.project-search-file-heading-text) {
   opacity: 0;
}
:deep(.project-search-file-header),
:deep(.project-search-file-header-margin),
.project-search-header {
   background: var(--color-accent-600);
   border-top: 1px solid color-mix(in srgb, var(--color-accent-500) 50%, transparent);
   border-bottom: 1px solid color-mix(in srgb, var(--color-accent-500) 50%, transparent);
}
</style>
