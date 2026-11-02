<script setup lang="ts">
import { useMonacoEditor } from '../../../_composables/use-monaco-editor';
import { normalizePath, getBaseName } from '~/utils/path-utils';
import Tab from '../_components/Tab.vue';
import { Setting } from '@icon-park/vue-next';
import { FileCode2 } from 'lucide-vue-next';
import TabSkeleton from '../_skeletons/TabSkeleton.vue';
import EditorSkeleton from '../_skeletons/EditorSkeleton.vue';
import EditorSettingsModal from '../_components/EditorSettingsModal.vue';
import type { WebContainer } from '@webcontainer/api';
import type { editor } from 'monaco-editor';
import {
   hasBinarySnapshotExtension,
   toSnapshotDataUrl,
} from '@challenge/shared/snapshot-content';
import { useEditorConfig } from '../_composables/use-editor-config';
import { useListenFileChanges } from '../_composables/use-listen-file-changes';
import { useMessage } from '~/components/st/Message/use-message';

const currentFilePath = defineModel<string>('currentFilePath');

interface ITab {
   path: string;
   name: string;
}

const openedTabs = ref<ITab[]>([]);
const draggedTabPath = ref<string | null>(null);

const startTabDrag = (event: DragEvent, path: string) => {
   if (!event.dataTransfer) return;
   draggedTabPath.value = path;
   event.dataTransfer.effectAllowed = 'move';
   event.dataTransfer.setData('application/x-quanta-editor-tab', path);
};

const reorderTabOnDrag = (event: DragEvent, path: string) => {
   if (!draggedTabPath.value || !event.currentTarget) return;
   event.preventDefault();
   if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

   const from = openedTabs.value.findIndex((tab) => tab.path === draggedTabPath.value);
   const target = openedTabs.value.findIndex((tab) => tab.path === path);
   if (from === -1 || target === -1 || from === target) return;

   const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
   const pastMiddle = event.clientX >= rect.left + rect.width / 2;
   if ((from < target && !pastMiddle) || (from > target && pastMiddle)) return;

   const [item] = openedTabs.value.splice(from, 1);
   if (item) openedTabs.value.splice(target, 0, item);
};

const endTabDrag = () => {
   draggedTabPath.value = null;
};

const dropTab = (event: DragEvent) => {
   if (!draggedTabPath.value) return;
   event.preventDefault();
   endTabDrag();
};

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
   const idx = openedTabs.value.indexOf(tab);

   // 先确定目标路径
   let targetPath: string | null = null;
   if (tab.path === currentFilePath.value) {
      if (idx > 0) {
         targetPath = openedTabs.value[idx - 1]!.path;
      } else if (openedTabs.value.length > 1) {
         targetPath = openedTabs.value[idx + 1]!.path;
      }
   }

   // 先删除 tab
   openedTabs.value.splice(idx, 1);

   // 然后设置新的当前文件
   if (targetPath !== null) {
      // 使用 nextTick 确保在下一个 tick 设置，避免 watch 冲突
      nextTick(() => {
         currentFilePath.value = targetPath!;
         setModel(targetPath!);
      });
   } else if (
      tab.path === currentFilePath.value &&
      openedTabs.value.length === 0
   ) {
      nextTick(() => {
         currentFilePath.value = '';
         setModel(null);
      });
   }
};

const onClickTab = (tab: ITab) => {
   setModel(tab.path);
   currentFilePath.value = tab.path;
};

const props = defineProps<{
   getWcInstance: () => Promise<WebContainer>;
   defaultFs?: Record<string, { vid: string; content: string }>;
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

onEditorInstanceReady((instance) => {
   editorInstance = instance;
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
   const disposeWatcher = watch(
      () => props.defaultFs,
      (fs) => {
         if (!fs) return;
         const models = objectMap(fs, ({ value }) => value.content);
         Object.keys(models)
            .filter((k) => k.endsWith('.svg') || hasBinarySnapshotExtension(k))
            .forEach((key) => delete models[key]);

         createModels(models);
         currentFilePath.value && setModel(currentFilePath.value);
         setTimeout(() => {
            disposeWatcher();
         }, 0);
      },
      { immediate: true }
   );
});

onModelChange((path) => {
   currentFilePath.value = path;
});

useListenFileChanges({
   openedTabs,
   currentFilePath: currentFilePath as any,
   onCloseTab,
   defaultFs: props.defaultFs || {},
   onEditorInstanceReady,
});

const setModel = (path: string | null, forceRecreate = false) => {
   onEditorInstanceReady((instance, monaco) => {
      if (!path) {
         instance.setModel(null);
         return;
      }

      // 统一规范化路径为前置 / 格式
      const normalizedPath = normalizePath(path);

      // 二进制文件不进 Monaco：编辑会把文本写回 WebContainer，损坏原文件
      if (hasBinarySnapshotExtension(normalizedPath)) {
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

const isBinaryFile = computed(
   () =>
      !!currentFilePath.value &&
      hasBinarySnapshotExtension(currentFilePath.value)
);

const imagePreviewSrc = computed(() => {
   if (!isBinaryFile.value) return undefined;
   const normalizedPath = normalizePath(currentFilePath.value!);
   const content = props.defaultFs?.[normalizedPath]?.content;
   return content ? toSnapshotDataUrl(normalizedPath, content) : undefined;
});

const closeCurrentTab = () => {
   const tab = openedTabs.value.find(
      (item) => item.path === currentFilePath.value
   );
   tab && onCloseTab(tab);
};

defineExpose({
   setModel,
   closeCurrentTab,
   onModelContentChange,
   addExtraLibs,
   onEditorInstanceReady,
   formatDocument,
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
         <StSpace
            fill-x
            class="h-[2rem] relative overflow-x-auto overflow-y-hidden mini-scrollbar">
            <StSpace fill-x align="center" gap="0.5rem" class="absolute left-0 top-0 h-full px-1">
               <StSkeleton :loading="!hasEditorReady">
                  <template #loading>
                     <TabSkeleton :count="3" />
                  </template>
                  <TransitionGroup tag="div" class="flex gap-2" move-class="editor-tab-move">
                     <Tab
                        v-for="item in openedTabs"
                        :key="item.path"
                        :content="item.name"
                        draggable="true"
                        :class="{
                           '!bg-primary !text-white': currentFilePath === item.path,
                           'opacity-50': draggedTabPath === item.path,
                        }"
                        @dragstart="startTabDrag($event, item.path)"
                        @dragover="reorderTabOnDrag($event, item.path)"
                        @drop="dropTab"
                        @dragend="endTabDrag"
                        @click="onClickTab(item)"
                        @remove="onCloseTab(item)" />
                  </TransitionGroup>
               </StSkeleton>
            </StSpace>
         </StSpace>
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
            v-show="hasEditorReady"
            :ref="containerKey"
            class="absolute top-0 left-0 size-full"></main>
         <StSpace
            v-if="hasEditorReady && isBinaryFile"
            fill
            center
            class="absolute top-0 left-0 size-full p-4 bg-[#1C1C1C]">
            <img
               v-if="imagePreviewSrc"
               :src="imagePreviewSrc"
               :alt="currentFilePath"
               class="max-w-full max-h-full object-contain" />
            <span v-else class="st-font-body-normal text-accent-400">
               该文件无法预览
            </span>
         </StSpace>
      </StSpace>
   </StSpace>

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
