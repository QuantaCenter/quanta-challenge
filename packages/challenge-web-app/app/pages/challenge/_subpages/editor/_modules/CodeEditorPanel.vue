<script setup lang="ts">
import { useMonacoEditor } from '../../../_composables/use-monaco-editor';
import { normalizePath, getBaseName } from '~/utils/path-utils';
import Tab from '../_components/Tab.vue';
import { Setting } from '@icon-park/vue-next';
import { FileCode2 } from 'lucide-vue-next';
import ProjectFilePicker from '../_components/ProjectFilePicker.vue';
import ProjectSearchPanel from '../_components/ProjectSearchPanel.vue';
import { listProjectFiles, readProjectText, replaceProjectSearchResults, searchProjectFiles, type ProjectMatch, type ProjectSearchPreferences, type ProjectSearchResult } from '~/utils/project-search';
import TabSkeleton from '../_skeletons/TabSkeleton.vue';
import EditorSkeleton from '../_skeletons/EditorSkeleton.vue';
import EditorSettingsModal from '../_components/EditorSettingsModal.vue';
import type { WebContainer } from '@webcontainer/api';
import type { editor } from 'monaco-editor';
import {
   snapshotBinaryBytes,
   snapshotDownloadUrl,
   snapshotImageUrl,
} from '~/utils/snapshot-preview';
import { useEditorConfig } from '../_composables/use-editor-config';
import { useListenFileChanges } from '../_composables/use-listen-file-changes';
import { useMessage } from '~/components/st/Message/use-message';
import { getProjectModelPaths } from '~/utils/project-model-files';
import { IGNORE_FILE_PATTERNS } from '../_configs';

const currentFilePath = defineModel<string>('currentFilePath');

interface ITab {
   path: string;
   name: string;
}

const openedTabs = ref<ITab[]>([]);
const searchTabOpened = ref(false);
const searchTabActive = ref(false);
const filePickerOpened = ref(false);
const searchPanel = ref<InstanceType<typeof ProjectSearchPanel>>();
const draggedTabPath = ref<string | null>(null);
const tabDragThreshold = 8;
let pendingTabDrag: { path: string; x: number; y: number; pointerId: number } | null = null;
let suppressTabClick = false;

const scrollTabs = (event: WheelEvent) => {
   if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;

   const container = event.currentTarget as HTMLElement;
   if (container.scrollWidth <= container.clientWidth) return;

   event.preventDefault();
   const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
         ? container.clientWidth
         : 1;
   container.scrollLeft += event.deltaY * unit;
};

const prepareTabDrag = (event: PointerEvent, path: string) => {
   if (event.button !== 0 || event.pointerType !== 'mouse') return;
   suppressTabClick = false;
   if ((event.target as HTMLElement).closest('[data-tab-close]')) return;
   pendingTabDrag = { path, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
};

const moveTabDrag = (event: PointerEvent) => {
   if (!pendingTabDrag || event.pointerId !== pendingTabDrag.pointerId) return;
   if (!(event.buttons & 1)) {
      endTabDrag();
      return;
   }
   if (!draggedTabPath.value) {
      const distance = Math.hypot(event.clientX - pendingTabDrag.x, event.clientY - pendingTabDrag.y);
      if (distance < tabDragThreshold) return;
      draggedTabPath.value = pendingTabDrag.path;
      suppressTabClick = true;
   }

   event.preventDefault();
   const targetElement = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-editor-tab]');
   const key = targetElement?.dataset.editorTab;
   if (!targetElement || !key?.startsWith('file:')) return;
   const path = key.slice('file:'.length);
   const from = openedTabs.value.findIndex((tab) => tab.path === draggedTabPath.value);
   const target = openedTabs.value.findIndex((tab) => tab.path === path);
   if (from === -1 || target === -1 || from === target) return;

   const rect = targetElement.getBoundingClientRect();
   const pastMiddle = event.clientX >= rect.left + rect.width / 2;
   if ((from < target && !pastMiddle) || (from > target && pastMiddle)) return;

   const [item] = openedTabs.value.splice(from, 1);
   if (item) openedTabs.value.splice(target, 0, item);
};

const endTabDrag = () => {
   pendingTabDrag = null;
   draggedTabPath.value = null;
};

const preventTabClickAfterDrag = (event: MouseEvent) => {
   if (!suppressTabClick) return;
   suppressTabClick = false;
   event.preventDefault();
   event.stopImmediatePropagation();
};

useEventListener('pointermove', moveTabDrag, { passive: false });
useEventListener('pointerup', endTabDrag);
useEventListener('pointercancel', endTabDrag);
useEventListener('blur', endTabDrag);

watch(
   currentFilePath,
   (newPath) => {
      if (!newPath) return;
      const normalizedPath = normalizePath(newPath);
      if (!openedTabs.value.find((tab) => tab.path === normalizedPath)) {
         openedTabs.value.push({
            path: normalizedPath,
            name: getBaseName(normalizedPath) || 'Untitled',
         });
      }
   },
   { immediate: true }
);

const onCloseTab = (tab: ITab) => {
   closeTabs([`file:${tab.path}`]);
};

const editorTabKeys = computed(() => [
   ...(searchTabOpened.value ? ['search'] : []),
   ...openedTabs.value.map((tab) => `file:${tab.path}`),
]);

const closeTabs = (keys: string[]) => {
   const closing = new Set(keys);
   const previousTabs = openedTabs.value;
   const currentIndex = previousTabs.findIndex((tab) => tab.path === currentFilePath.value);
   const currentFileClosed = closing.has(`file:${currentFilePath.value}`);
   const keepSearchActive = searchTabActive.value && !closing.has('search');

   openedTabs.value = previousTabs.filter((tab) => !closing.has(`file:${tab.path}`));
   if (closing.has('search')) searchTabOpened.value = false;

   if (currentFileClosed) {
      const previous = previousTabs
         .slice(0, currentIndex)
         .reverse()
         .find((tab) => !closing.has(`file:${tab.path}`));
      const nextPath = previous?.path ?? openedTabs.value[0]?.path ?? '';
      // 批量关闭后只切换一次模型，避免逐个关闭时重新打开已关闭的标签。
      nextTick(() => {
         currentFilePath.value = nextPath;
         setModel(nextPath || null);
         searchTabActive.value = keepSearchActive || (!nextPath && searchTabOpened.value);
      });
   } else {
      searchTabActive.value = keepSearchActive;
   }
};

const tabMenuCommands = (target: HTMLElement | null) => {
   const key = target?.closest<HTMLElement>('[data-editor-tab]')?.dataset.editorTab;
   const keys = editorTabKeys.value;
   const index = key ? keys.indexOf(key) : -1;
   return [
      { label: '关闭', keys: index < 0 ? [] : [key!] },
      { label: '关闭其他标签页', keys: index < 0 ? [] : keys.filter((item) => item !== key) },
      { label: '关闭左侧标签页', keys: index < 0 ? [] : keys.slice(0, index) },
      { label: '关闭右侧标签页', keys: index < 0 ? [] : keys.slice(index + 1) },
      { label: '关闭全部标签页', keys },
   ];
};

const onClickTab = (tab: ITab) => {
   searchTabActive.value = false;
   setModel(tab.path);
   currentFilePath.value = tab.path;
};

const props = defineProps<{
   getWcInstance: () => Promise<WebContainer>;
   defaultFs?: Record<string, { vid: string; content: string }>;
   loadFile: (path: string) => Promise<string>;
   saveReplacement: (path: string, content: string) => Promise<void>;
}>();

const {
   containerKey,
   createModels,
   onEditorInstanceReady,
   onModelChange,
   onModelContentChange,
   addExtraLibs,
} = useMonacoEditor();

const hasEditorReady = ref(false);

// 配置 Modal 状态
const isSettingsModalOpen = ref(false);

const { editorConfig } = useEditorConfig({ onEditorInstanceReady });

const message = useMessage();
let editorInstance: editor.IStandaloneCodeEditor | undefined;
let monacoInstance: typeof import('monaco-editor') | undefined;

onEditorInstanceReady((instance, monaco) => {
   editorInstance = instance;
   monacoInstance = monaco;
});

const formatDocument = async () => {
   if (!editorInstance?.getModel()) {
      message.info('请先打开可编辑的文件');
      return;
   }

   const action = editorInstance.getAction('editor.action.formatDocument');
   if (!action?.isSupported()) {
      message.info('当前文件暂不支持格式化');
      return;
   }

   try {
      await action.run();
   } catch (error) {
      console.error('[editor] 格式化失败:', error);
      message.error('格式化失败', '请检查文件内容后重试');
   }
};

// 移动端顶栏撤回/重做：注册执行能力，供顶栏按钮调用
const { actions: historyActions, canUndo, canRedo } = useMobileEditorHistory();

const undo = () => {
   onEditorInstanceReady((instance) => {
      instance.trigger('mobile-toolbar', 'undo', null);
      syncHistoryState(instance);
   });
};

const redo = () => {
   onEditorInstanceReady((instance) => {
      instance.trigger('mobile-toolbar', 'redo', null);
      syncHistoryState(instance);
   });
};

/**
 * Monaco 0.52 的类型声明移除了 model.undo / model.canUndo / model.canRedo，
 * 但运行时实现仍在（内部委托全局 IUndoRedoService，与 VS Code 的撤回/重做
 * 可用态判定同源），可直接调用。
 * 不能再用版本号近似判断：0.52 下 versionId 在撤回/重做时同样单调递增，
 * alternativeVersionId 被撤回栈整体覆盖，"alternativeVersionId > versionId"
 * 的旧近似不再成立，会导致重做按钮始终置灰。
 */
type HistoryCapableModel = editor.ITextModel & {
   canUndo?: () => boolean;
   canRedo?: () => boolean;
};

const syncHistoryState = (instance: editor.IStandaloneCodeEditor) => {
   const model = instance.getModel() as HistoryCapableModel | null;
   canUndo.value = !!model && (model.canUndo?.() ?? model.getVersionId() > 1);
   canRedo.value =
      !!model &&
      (model.canRedo?.() ??
         model.getAlternativeVersionId() > model.getVersionId());
};

onEditorInstanceReady((instance) => {
   const update = () => syncHistoryState(instance);
   instance.onDidChangeModelContent(update);
   instance.onDidChangeModel(update);
   update();
});

historyActions.value = { undo, redo };

onUnmounted(() => {
   if (historyActions.value?.undo === undo) {
      historyActions.value = null;
      canUndo.value = false;
      canRedo.value = false;
   }
});

onEditorInstanceReady(() => {
   hasEditorReady.value = true;
});

const projectModelPaths = computed(() => getProjectModelPaths(
   Object.keys(props.defaultFs ?? {}),
   props.defaultFs?.['/project/.gitignore']?.content ?? '',
   IGNORE_FILE_PATTERNS,
));
const preloadedModels = new Map<string, editor.ITextModel>();

// 预加载未打开的项目文件，使语言服务可以解析跨文件引用和跳转。
// 只监听路径和忽略规则，避免每次输入都重新扫描整个项目的文件内容。
watch([hasEditorReady, projectModelPaths], ([ready, paths]) => {
   if (!ready || !monacoInstance) return;
   const included = new Set(paths);
   for (const [path, model] of preloadedModels) {
      if (model.isDisposed()) {
         preloadedModels.delete(path);
      } else if (!included.has(path) && !openedTabs.value.some((tab) => tab.path === path)) {
         model.dispose();
         preloadedModels.delete(path);
      }
   }
   const files: Record<string, string> = {};
   for (const path of paths) {
      if (monacoInstance.editor.getModel(monacoInstance.Uri.file(path))) continue;
      const content = props.defaultFs?.[path]?.content;
      if (content === undefined || snapshotBinaryBytes(path, content)) continue;
      files[path] = content;
   }
   createModels(files);
   for (const path of Object.keys(files)) {
      const model = monacoInstance.editor.getModel(monacoInstance.Uri.file(path));
      if (model) preloadedModels.set(path, model);
   }

   const path = currentFilePath.value;
   if (path && !searchTabActive.value && !editorInstance?.getModel()) {
      setModel(path);
   }
});

onModelChange((path) => {
   currentFilePath.value = normalizePath(path);
});

useListenFileChanges({
   openedTabs,
   currentFilePath: currentFilePath as any,
   onCloseTab,
   defaultFs: props.defaultFs || {},
   onEditorInstanceReady,
});

const setModel = (path: string | null, forceRecreate = false) => {
   searchTabActive.value = false;
   onEditorInstanceReady((instance, monaco) => {
      if (!path) {
         instance.setModel(null);
         return;
      }

      // 统一规范化路径为前置 / 格式
      const normalizedPath = normalizePath(path);

      // 二进制文件不进 Monaco：编辑会把文本写回 WebContainer，损坏原文件
      const content = props.defaultFs?.[normalizedPath]?.content;
      if (snapshotBinaryBytes(normalizedPath, content)) {
         instance.setModel(null);
         currentFilePath.value = normalizedPath;
         return;
      }

      const model = monaco.editor.getModel(monaco.Uri.file(normalizedPath));

      // 如果需要强制重新创建 model（例如处理 suspense 文件）
      if (forceRecreate && model) {
         model.dispose();
      }

      // 重新获取或创建 model
      const existingModel = monaco.editor.getModel(
         monaco.Uri.file(normalizedPath)
      );

      if (existingModel && !forceRecreate) {
         instance.setModel(existingModel);
         currentFilePath.value = normalizedPath;
      } else {
         const content = props.defaultFs?.[normalizedPath]?.content;
         if (typeof content === 'undefined') return;

         instance.setModel(
            monaco.editor.createModel(
               content,
               void 0,
               monaco.Uri.file(normalizedPath)
            )
         );
      }
   });
};

const isBinaryFile = computed(() => {
   if (!currentFilePath.value) return false;
   const path = normalizePath(currentFilePath.value);
   return !!snapshotBinaryBytes(path, props.defaultFs?.[path]?.content);
});

const imagePreviewSrc = computed(() => {
   if (!isBinaryFile.value) return undefined;
   const normalizedPath = normalizePath(currentFilePath.value!);
   const content = props.defaultFs?.[normalizedPath]?.content;
   return snapshotImageUrl(normalizedPath, content);
});

const binaryDownloadUrl = computed(() => {
   if (!currentFilePath.value) return undefined;
   const path = normalizePath(currentFilePath.value);
   return snapshotDownloadUrl(path, props.defaultFs?.[path]?.content);
});
const binarySize = computed(() => {
   if (!currentFilePath.value) return 0;
   const path = normalizePath(currentFilePath.value);
   const bytes = snapshotBinaryBytes(path, props.defaultFs?.[path]?.content);
   return bytes?.byteLength ?? 0;
});

const closeCurrentTab = () => {
   if (searchTabActive.value) {
      closeSearchTab();
      return;
   }
   const tab = openedTabs.value.find(
      (item) => item.path === currentFilePath.value
   );
   tab && onCloseTab(tab);
};

const closeSearchTab = () => {
   searchTabOpened.value = false;
   searchTabActive.value = false;
   nextTick(() => editorInstance?.focus());
};

const openProjectSearch = () => {
   filePickerOpened.value = false;
   searchTabOpened.value = true;
   searchTabActive.value = true;
   useEditorStore().mobileBoardJump = { board: 'code', at: Date.now() };
   nextTick(() => searchPanel.value?.focus());
};

const openQuickOpen = () => { filePickerOpened.value = true; };
useEventBus<'files' | 'content'>('editor-project-search').on((kind) => {
   useEditorStore().mobileFileDrawerOpened = false;
   if (kind === 'files') openQuickOpen();
   else openProjectSearch();
});
const loadProjectPaths = async (signal: AbortSignal) => {
   const wc = await props.getWcInstance();
   return listProjectFiles(wc.fs, signal);
};
const searchProject = async (query: string, signal: AbortSignal, preferences: ProjectSearchPreferences) => {
   const wc = await props.getWcInstance();
   const editedContents = new Map<string, string>();
   onEditorInstanceReady((_, monaco) => {
      for (const model of monaco.editor.getModels()) {
         // Unsaved edits win over the filesystem; unchanged models may be stale after terminal writes.
         if (model.getAlternativeVersionId() > 1) {
            editedContents.set(model.uri.path, model.getValue());
         }
      }
   });
   return searchProjectFiles(wc.fs, query, {
      ...preferences,
      signal,
      getEditedContent: (path) => editedContents.get(path),
   });
};

const replaceProject = async (result: ProjectSearchResult, replacement: string) => {
   const wc = await props.getWcInstance();
   const getModel = (path: string) => monacoInstance?.editor.getModel(monacoInstance.Uri.file(path));
   return replaceProjectSearchResults(result, replacement, {
      readFile: async (path) => {
         const model = getModel(path);
         return model && model.getAlternativeVersionId() > 1 ? model.getValue() : readProjectText(wc.fs, path);
      },
      writeFile: async (path, content) => {
         await props.saveReplacement(path, content);
         const model = getModel(path);
         if (model && model.getValue() !== content) {
            model.pushStackElement();
            model.pushEditOperations([], [{ range: model.getFullModelRange(), text: content }], () => null);
            model.pushStackElement();
         }
      },
   });
};

let openRequest = 0;
onUnmounted(() => { openRequest++; });
const openProjectFile = async (path: string, match?: ProjectMatch) => {
   const request = ++openRequest;
   try {
      await props.loadFile(path);
      if (request !== openRequest) return;
      setModel(path);
      currentFilePath.value = path;
      useEditorStore().mobileBoardJump = { board: 'code', at: Date.now() };
      await nextTick();
      onEditorInstanceReady((instance) => {
         if (match) {
            const range = {
               startLineNumber: match.line,
               startColumn: match.column,
               endLineNumber: match.line,
               endColumn: match.column + match.length,
            };
            instance.setSelection(range);
            instance.revealRangeInCenter(range);
         }
         instance.focus();
      });
   } catch {
      message.error('无法打开文件', '文件可能已移动或删除，请重新搜索');
   }
};

defineExpose({
   setModel,
   closeCurrentTab,
   onModelContentChange,
   addExtraLibs,
   onEditorInstanceReady,
   formatDocument,
   openProjectSearch,
   openQuickOpen,
});
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      gap="0"
      class="bg-[#1F1F1F] rounded-xl max-md:rounded-t-none overflow-hidden">
      <StSpace
         fill-x
         class="p-1 rounded-t-xl max-md:rounded-t-none bg-accent-600"
         justify="between"
         align="center"
         gap="0">
         <StContextMenuProvider class="flex-1 min-w-0">
            <template #menu>
               <StContextMenuRoot v-slot="{ target }" class="min-w-[11rem]">
                  <StContextMenuList class="text-accent-100">
                     <StContextMenuItem
                        v-for="command in tabMenuCommands(target)"
                        :key="command.label"
                        :disabled="command.keys.length === 0"
                        @action="closeTabs(command.keys)">
                        {{ command.label }}
                     </StContextMenuItem>
                  </StContextMenuList>
               </StContextMenuRoot>
            </template>
            <StSpace
               fill-x
               class="h-[2rem] relative overflow-x-auto overflow-y-hidden hide-scrollbar"
               @wheel="scrollTabs">
               <StSpace fill-x align="center" gap="0.5rem" class="absolute left-0 top-0 h-full px-1">
                  <StSkeleton :loading="!hasEditorReady">
                     <template #loading>
                        <TabSkeleton :count="3" />
                     </template>
                     <TransitionGroup tag="div" class="flex gap-2" move-class="editor-tab-move">
                        <Tab
                           v-if="searchTabOpened"
                           key="project-search"
                           data-editor-tab="search"
                           content="全局搜索"
                           :class="{ '!bg-primary !text-white': searchTabActive }"
                           @click="openProjectSearch"
                           @remove="closeSearchTab" />
                        <Tab
                           v-for="item in openedTabs"
                           :key="item.path"
                           :content="item.name"
                           :data-editor-tab="`file:${item.path}`"
                           draggable="false"
                           :class="{
                              '!bg-primary !text-white': !searchTabActive && currentFilePath === item.path,
                              'opacity-50': draggedTabPath === item.path,
                           }"
                           @pointerdown="prepareTabDrag($event, item.path)"
                           @click.capture="preventTabClickAfterDrag"
                           @click="onClickTab(item)"
                           @remove="onCloseTab(item)" />
                     </TransitionGroup>
                  </StSkeleton>
               </StSpace>
            </StSpace>
         </StContextMenuProvider>
         <StPopover content="格式化当前文件" placement="bottom" class="shrink-0">
            <StButton
               size="sm"
               aria-label="格式化当前文件"
               class="!p-0 !bg-accent-500 hover:!bg-accent-400 size-[2rem] shrink-0 !rounded-[0.5rem] m-0.5 !text-accent-200"
               @click="formatDocument"
            >
               <FileCode2 :size="16" />
            </StButton>
         </StPopover>
         <StPopover content="编辑器设置" placement="bottom" class="shrink-0">
            <StButton
               size="sm"
               aria-label="编辑器设置"
               aria-haspopup="dialog"
               class="!p-0 !bg-accent-500 hover:!bg-accent-400 size-[2rem] shrink-0 !rounded-[0.5rem] m-0.5 !text-accent-200"
               @click="isSettingsModalOpen = true"
            >
               <Setting />
            </StButton>
         </StPopover>
      </StSpace>

      <StSpace fill class="relative bg-[#1C1C1C] border border-[#1F1F1F]">
         <EditorSkeleton v-if="!hasEditorReady" />
         <main
            v-show="hasEditorReady && !searchTabActive"
            :ref="containerKey"
            class="absolute top-0 left-0 size-full"></main>
         <StSpace
            v-if="hasEditorReady && isBinaryFile && !searchTabActive"
            fill
            center
            class="absolute top-0 left-0 size-full p-4 bg-[#1C1C1C]">
            <StSpace direction="vertical" center gap="0.75rem" class="max-w-full max-h-full">
               <img
                  v-if="imagePreviewSrc"
                  :src="imagePreviewSrc"
                  :alt="currentFilePath"
                  class="max-w-full max-h-[70%] object-contain" />
               <span class="st-font-body-normal text-accent-400">
                  {{ currentFilePath && getBaseName(currentFilePath) }} · {{ binarySize }} 字节
               </span>
               <a
                  v-if="binaryDownloadUrl"
                  :href="binaryDownloadUrl"
                  :download="currentFilePath && getBaseName(currentFilePath)"
                  class="text-primary">下载文件</a>
            </StSpace>
         </StSpace>
         <ProjectSearchPanel
            v-if="searchTabOpened"
            v-show="searchTabActive"
            ref="searchPanel"
            class="absolute inset-0"
            :search="searchProject"
            :replace="replaceProject"
            @select="openProjectFile" />
      </StSpace>
   </StSpace>

   <ProjectFilePicker v-model:opened="filePickerOpened" :load-files="loadProjectPaths" @select="openProjectFile" />

   <!-- 编辑器设置 Modal -->
   <EditorSettingsModal
      v-model:opened="isSettingsModalOpen"
      :config="editorConfig"
      @update:config="(newConfig) => Object.assign(editorConfig, newConfig)" />
</template>

<style scoped src="@/assets/css/utils.css" />

<style scoped>
.editor-tab-move {
   transition: transform 160ms ease;
}

@media (prefers-reduced-motion: reduce) {
   .editor-tab-move {
      transition: none;
   }
}
</style>

<style lang="css">
* {
   --vscode-editorGutter-background: transparent !important;
   --vscode-editor-background: transparent !important;
   /* --vscode-editorStickyScroll-background: #272727 !important; */
}

.suggest-widget {
   border-radius: 0.25rem !important;
   border: 1px solid #272727 !important;
   overflow: hidden !important;
}

.colorpicker-color-decoration {
   border-radius: 4px !important;
}
</style>
