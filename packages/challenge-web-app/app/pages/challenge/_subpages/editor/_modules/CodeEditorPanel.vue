<script setup lang="ts">
import { useMonacoEditor } from '../../../_composables/use-monaco-editor';
import { normalizePath, getBaseName } from '~/utils/path-utils';
import Tab from '../_components/Tab.vue';
import { MoreOne, Setting } from '@icon-park/vue-next';
import TabSkeleton from '../_skeletons/TabSkeleton.vue';
import EditorSkeleton from '../_skeletons/EditorSkeleton.vue';
import EditorSettingsModal from '../_components/EditorSettingsModal.vue';
import type { WebContainer } from '@webcontainer/api';
import type { editor } from 'monaco-editor';
import { onClickOutside } from '@vueuse/core';
import {
   hasBinarySnapshotExtension,
   toSnapshotDataUrl,
} from '@challenge/shared/snapshot-content';
import { useEditorConfig } from '../_composables/use-editor-config';
import { useListenFileChanges } from '../_composables/use-listen-file-changes';

const currentFilePath = defineModel<string>('currentFilePath');

interface ITab {
   path: string;
   name: string;
}

const openedTabs = ref<ITab[]>([]);
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

// 下拉菜单状态
const isDropdownOpen = ref(false);
// 菜单内容延迟到首次打开才渲染
const hasOpenedDropdown = ref(false);
const dropdownButtonRef = ref<HTMLElement>();
const dropdownMenuRef = ref<HTMLElement>();

// 配置 Modal 状态
const isSettingsModalOpen = ref(false);

// 打开/收起下拉菜单
const toggleDropdown = async () => {
   isDropdownOpen.value = !isDropdownOpen.value;
   if (isDropdownOpen.value) {
      hasOpenedDropdown.value = true;
      // 关闭态是 display:none，打开后需等 DOM 恢复显示再让 Popper 重新测量定位
      await nextTick();
      popperInstance.value?.update();
   }
};

const { popperKey, containerKey: popperContainerKey, popperInstance } = usePopper({
   options: {
      placement: 'bottom-end',
      modifiers: [
         {
            name: 'offset',
            options: {
               offset: [0, 0],
            },
         },
      ],
   },
});

const { editorConfig } = useEditorConfig({ onEditorInstanceReady });

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

// 打开配置 Modal
const openSettingsModal = () => {
   isSettingsModalOpen.value = true;
   isDropdownOpen.value = false;
};

// 点击外部关闭下拉菜单
onClickOutside(
   dropdownMenuRef,
   () => {
      isDropdownOpen.value = false;
   },
   { ignore: [dropdownButtonRef] }
);
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
            class="h-[2rem] relative overflow-x-auto mini-scrollbar">
            <StSpace fill-x gap="0.5rem" class="absolute left-0 top-0 p-1">
               <StSkeleton :loading="!hasEditorReady">
                  <template #loading>
                     <TabSkeleton :count="3" />
                  </template>
                  <Tab
                     v-for="item in openedTabs"
                     :key="item.path"
                     :content="item.name"
                     :class="{
                        '!bg-primary !text-white':
                           currentFilePath === item.path,
                     }"
                     @click="onClickTab(item)"
                     @remove="onCloseTab(item)" />
               </StSkeleton>
            </StSpace>
         </StSpace>
         <div class="relative">
            <div
               :ref="popperContainerKey"
               class="size-[2rem] rounded-[0.5rem] m-0.5 text-accent-200 bg-accent-500 cursor-pointer hover:bg-accent-400 transition-colors flex items-center justify-center"
               @click="toggleDropdown">
               <MoreOne />
            </div>

            <Teleport to="body">
               <div
                  :ref="popperKey"
                  class="absolute transition-all flex gap-0 flex-col py-1 bg-accent-600 rounded-lg shadow-lg overflow-hidden z-[10003] min-w-[9rem]"
                  :class="isDropdownOpen ? 'visible' : 'hidden'">
                  <template v-if="hasOpenedDropdown">
                     <StSpace
                        align="center"
                        gap="0.5rem"
                        class="w-full px-4 py-2.5 text-left text-accent-100 hover:bg-accent-500 transition-colors st-font-body-normal cursor-pointer text-nowrap whitespace-nowrap"
                        @click="openSettingsModal">
                        <Setting />
                        编辑器设置
                     </StSpace>
                  </template>
               </div>
            </Teleport>
         </div>
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
