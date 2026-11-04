<script setup lang="ts">
import {
   Clear,
   Code,
   FileCode,
   PlayOne,
   Terminal,
   Undo,
} from '@icon-park/vue-next';
import type monaco from 'monaco-editor';
import { useElementSize } from '@vueuse/core';
import { useSimpleEditor } from '~/composables/use-simple-editor';
import { extensionIconMapping } from '~/components/st/FileSystemTree/config';
import {
   buildPlaygroundDocument,
   PLAYGROUND_MESSAGE_SOURCE,
   type IPlaygroundSpec,
} from '~/utils/markdown-playground';

/** 与资源管理器一致：先按完整文件名，再按由长到短的扩展名匹配图标 */
const fileIcon = (name: string) => {
   const segments = name.split('.');
   for (let index = 0; index < segments.length; index += 1) {
      const key = index === 0 ? name : `.${segments.slice(index).join('.')}`;
      const icon = extensionIconMapping.get(key);
      if (icon) return icon;
   }
   return undefined;
};

/** 文章里的静态演练：编辑器 + 预览 / 控制台，全部在浏览器内完成。 */
const props = defineProps<{ spec: IPlaygroundSpec }>();

type TLayout = IPlaygroundSpec['layout'];
type TConsoleLevel = 'log' | 'info' | 'warn' | 'error';

interface IConsoleEntry {
   id: number;
   level: TConsoleLevel;
   text: string;
}

const CONSOLE_LEVELS: TConsoleLevel[] = ['log', 'info', 'warn', 'error'];
const MAX_CONSOLE_ENTRIES = 100;
/** 容器宽度不足该值（px）时固定为上下布局 */
const SPLIT_MIN_WIDTH = 640;
/** 面板标题栏高度 */
const BAR_HEIGHT = '2rem';
/** 与预览同时展示时的控制台内容高度 */
const DOCKED_CONSOLE_HEIGHT = '7.5rem';

const LAYOUT_OPTIONS: { value: TLayout; label: string }[] = [
   { value: 'horizontal', label: '左右布局' },
   { value: 'vertical', label: '上下布局' },
];

const files = props.spec.files;
const hasPreview = props.spec.preview;

const root = useTemplateRef<HTMLElement>('root');
const consoleBody = useTemplateRef<HTMLElement>('console-body');
const preview = useTemplateRef<HTMLIFrameElement>('preview');

const { width } = useElementSize(root);
const isMobile = useIsMobile();
const canSplit = computed(() => width.value >= SPLIT_MIN_WIDTH);
/** 学员手动切换过的布局；未切换时 PC 端用作者配置，移动端默认上下 */
const userLayout = ref<TLayout | null>(null);
const preferredLayout = computed<TLayout>(
   () => userLayout.value ?? (isMobile.value ? 'vertical' : props.spec.layout),
);
const layout = computed<TLayout>(() =>
   canSplit.value ? preferredLayout.value : 'vertical',
);

const codes = ref(files.map((file) => file.code));
const activeIndex = ref(0);
const runToken = ref(0);
const previewDocument = ref('');
const entries = ref<IConsoleEntry[]>([]);
const pending = ref(false);

const consoleOpened = ref(props.spec.console === 'show');
let consoleToggled = false;
const consoleVisible = computed(() => !hasPreview || consoleOpened.value);
const hasUnread = computed(
   () => !consoleVisible.value && entries.value.length > 0,
);

let entryId = 0;
let models: monaco.editor.ITextModel[] = [];
let resetting = false;

const {
   containerKey,
   getEditor,
   onEditorReady,
   onBeforeEditorDisposed,
   onEditorContentChanged,
} = useSimpleEditor({
   script: files[0]?.code ?? '',
   language: files[0]?.language ?? 'html',
   containerRef: 'playground-editor',
   options: {
      fontFamily: 'FiraCode Nerd Font Mono, monospace',
      fontSize: 13,
      lineHeight: 22,
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 8,
      wordWrap: 'on',
      tabSize: 2,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      folding: false,
      guides: { indentation: false },
      padding: { top: 12, bottom: 12 },
      scrollbar: {
         verticalScrollbarSize: 6,
         horizontalScrollbarSize: 6,
         alwaysConsumeMouseWheel: true,
      },
   },
});

const run = () => {
   entries.value = [];
   pending.value = false;
   previewDocument.value = buildPlaygroundDocument(
      files.map((file, index) => ({ ...file, code: codes.value[index] ?? '' })),
   );
   runToken.value += 1;
};

const debouncedRun = useDebounceFn(run, 700);

// 预览文档在 setup 期就绪，服务端渲染也能直接带出初始效果
run();

onEditorReady((editor, monacoInstance) => {
   const initial = editor.getModel();
   models = files.map((file) =>
      monacoInstance.editor.createModel(file.code, file.language),
   );
   const active = models[activeIndex.value];
   if (active) editor.setModel(active);
   initial?.dispose();
   editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter,
      run,
   );
});

onBeforeEditorDisposed(() => {
   models.forEach((model) => model.dispose());
   models = [];
});

onEditorContentChanged((content) => {
   if (resetting) return;
   codes.value[activeIndex.value] = content;
   pending.value = true;
   debouncedRun();
});

const selectFile = (index: number) => {
   activeIndex.value = index;
   const model = models[index];
   if (model) getEditor()?.setModel(model);
};

const reset = () => {
   resetting = true;
   files.forEach((file, index) => {
      codes.value[index] = file.code;
      models[index]?.setValue(file.code);
   });
   resetting = false;
   run();
};

const toggleConsole = () => {
   consoleToggled = true;
   consoleOpened.value = !consoleOpened.value;
};

const revealConsole = (level: TConsoleLevel) => {
   if (consoleOpened.value || consoleToggled) return;
   const important = level === 'warn' || level === 'error';
   if (important || props.spec.console === 'auto') consoleOpened.value = true;
};

const onMessage = (event: MessageEvent) => {
   const data = event.data as
      | { source?: string; level?: string; text?: string }
      | null;
   if (!data || data.source !== PLAYGROUND_MESSAGE_SOURCE) return;
   if (preview.value && event.source !== preview.value.contentWindow) return;
   const level = CONSOLE_LEVELS.includes(data.level as TConsoleLevel)
      ? (data.level as TConsoleLevel)
      : 'log';
   entryId += 1;
   entries.value = [
      ...entries.value.slice(1 - MAX_CONSOLE_ENTRIES),
      { id: entryId, level, text: String(data.text ?? '') },
   ];
   revealConsole(level);
};

watch(
   () => entries.value.length,
   () =>
      nextTick(() => {
         const body = consoleBody.value;
         if (body) body.scrollTop = body.scrollHeight;
      }),
);

onMounted(() => window.addEventListener('message', onMessage));
onBeforeUnmount(() => window.removeEventListener('message', onMessage));

const editorPaneHeight = `calc(${BAR_HEIGHT} + ${props.spec.editorHeight})`;
const outputPaneHeight = computed(() => {
   const parts: string[] = [];
   if (hasPreview) parts.push(BAR_HEIGHT, props.spec.height);
   if (consoleVisible.value) {
      parts.push(BAR_HEIGHT, hasPreview ? DOCKED_CONSOLE_HEIGHT : props.spec.height);
   }
   return `calc(${parts.join(' + ')})`;
});

const bodyStyle = computed(() =>
   layout.value === 'horizontal'
      ? { height: `max(${editorPaneHeight}, ${outputPaneHeight.value})` }
      : undefined,
);
const editorStyle = computed(() =>
   layout.value === 'vertical' ? { height: editorPaneHeight } : undefined,
);
const previewStyle = computed(() =>
   layout.value === 'vertical' ? { height: props.spec.height } : undefined,
);
const consoleStyle = computed(() => {
   if (hasPreview) return { height: DOCKED_CONSOLE_HEIGHT };
   return layout.value === 'vertical' ? { height: props.spec.height } : undefined;
});
</script>

<template>
   <section ref="root" class="st-playground" :class="`is-${layout}`">
      <header class="st-playground__header">
         <div class="st-playground__heading">
            <Code class="st-playground__heading-icon" />
            <span class="st-playground__title">{{ spec.title || '代码演练' }}</span>
         </div>

         <div class="st-playground__toolbar">
            <div
               v-if="canSplit"
               class="st-playground__segmented"
               role="radiogroup"
               aria-label="切换布局">
               <StPopover
                  v-for="option in LAYOUT_OPTIONS"
                  :key="option.value"
                  :content="option.label"
                  placement="top"
                  class="shrink-0">
                  <button
                     type="button"
                     role="radio"
                     class="st-playground__icon-button"
                     :class="{ 'is-active': preferredLayout === option.value }"
                     :aria-checked="preferredLayout === option.value"
                     :aria-label="option.label"
                     @click="userLayout = option.value">
                     <svg
                        viewBox="0 0 24 24"
                        width="15"
                        height="15"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linejoin="round"
                        aria-hidden="true">
                        <rect x="3" y="4" width="18" height="16" rx="2.5" />
                        <path
                           :d="option.value === 'horizontal' ? 'M12 4v16' : 'M3 12h18'" />
                     </svg>
                  </button>
               </StPopover>
            </div>

            <span v-if="canSplit" class="st-playground__divider" aria-hidden="true" />

            <StPopover
               v-if="hasPreview"
               :content="consoleOpened ? '隐藏控制台' : '显示控制台'"
               placement="top"
               class="shrink-0">
               <button
                  type="button"
                  class="st-playground__icon-button"
                  :class="{ 'is-active': consoleOpened, 'has-dot': hasUnread }"
                  :aria-pressed="consoleOpened"
                  aria-label="控制台"
                  @click="toggleConsole">
                  <Terminal size="15" />
               </button>
            </StPopover>

            <StPopover content="恢复初始代码" placement="top" class="shrink-0">
               <button
                  type="button"
                  class="st-playground__icon-button"
                  aria-label="恢复初始代码"
                  @click="reset">
                  <Undo size="15" />
               </button>
            </StPopover>

            <StPopover
               content="立即运行（Ctrl / ⌘ + Enter）"
               placement="top"
               class="shrink-0">
               <button
                  type="button"
                  class="st-playground__icon-button st-playground__run"
                  :class="{ 'is-pending': pending }"
                  aria-label="立即运行"
                  @click="run">
                  <PlayOne size="15" theme="filled" />
               </button>
            </StPopover>
         </div>
      </header>

      <div class="st-playground__body" :style="bodyStyle">
         <div class="st-playground__pane st-playground__editor" :style="editorStyle">
            <div class="st-playground__bar">
               <div class="st-playground__tabs" role="tablist">
                  <button
                     v-for="(file, index) in files"
                     :key="file.name"
                     type="button"
                     role="tab"
                     class="st-playground__tab"
                     :class="{ 'is-active': index === activeIndex }"
                     :aria-selected="index === activeIndex"
                     @click="selectFile(index)">
                     <img
                        v-if="fileIcon(file.name)"
                        :src="fileIcon(file.name)"
                        alt=""
                        class="st-playground__file-icon"
                        aria-hidden="true" />
                     <FileCode v-else theme="filled" size="14" aria-hidden="true" />
                     {{ file.name }}
                  </button>
               </div>
            </div>
            <div class="st-playground__monaco-wrap">
               <div :ref="containerKey" class="st-playground__monaco"></div>
            </div>
         </div>

         <div class="st-playground__output">
            <div v-show="hasPreview" class="st-playground__pane st-playground__preview">
               <div class="st-playground__bar">
                  <span class="st-playground__bar-title">预览</span>
               </div>
               <div class="st-playground__frame-wrap" :style="previewStyle">
                  <iframe
                     ref="preview"
                     :key="runToken"
                     :srcdoc="previewDocument"
                     class="st-playground__frame"
                     sandbox="allow-scripts allow-forms allow-modals allow-popups"
                     title="演练预览"></iframe>
               </div>
            </div>

            <div
               v-if="consoleVisible"
               class="st-playground__pane st-playground__console"
               :class="{ 'is-docked': hasPreview }">
               <div class="st-playground__bar">
                  <span class="st-playground__bar-title">控制台</span>
                  <span v-if="entries.length" class="st-playground__count">
                     {{ entries.length }}
                  </span>
                  <StPopover content="清空" placement="top" class="ml-auto shrink-0">
                     <button
                        type="button"
                        class="st-playground__icon-button is-small"
                        aria-label="清空控制台"
                        :disabled="!entries.length"
                        @click="entries = []">
                        <Clear size="13" />
                     </button>
                  </StPopover>
               </div>
               <div ref="console-body" class="st-playground__console-body" :style="consoleStyle">
                  <div v-if="!entries.length" class="st-playground__console-empty">
                     {{ pending ? '等待运行…' : '暂无输出，试试 console.log()' }}
                  </div>
                  <div
                     v-for="entry in entries"
                     :key="entry.id"
                     class="st-playground__console-line"
                     :class="`is-${entry.level}`">
                     {{ entry.text }}
                  </div>
               </div>
            </div>
         </div>
      </div>
   </section>
</template>

<style src="./style.css" />
