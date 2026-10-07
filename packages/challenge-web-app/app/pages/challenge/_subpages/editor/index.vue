<script setup lang="ts">
import { buildFileSystemTree } from '~/utils/fs-tree';
import {
   normalizePath,
   getParentPath,
   splitPath,
   toProjectMountPath,
} from '~/utils/path-utils';
import { toSeoText } from '~/utils/seo-text';
import type { IFileSystemItem } from '~/components/st/FileSystemTree/type';
import FileManagerPanel from './_modules/FileManagerPanel.vue';
import CodeEditorPanel from './_modules/CodeEditorPanel.vue';
import TerminalPanel from './_modules/TerminalPanel.vue';
import PreviewPanel from './_modules/PreviewPanel.vue';
import { useWebContainer } from '../../_composables/use-web-container';
import DetailWindow from './_components/DetailWindow.vue';
import CommitModal from './_components/CommitModal.vue';
import EditorBoardLayout from './_components/EditorBoardLayout.vue';
import { useCommands } from '../../_composables/use-commands/index';
import { useFileChangeSync } from './_composables/use-file-change-sync';
import { IGNORE_FILE_PATTERNS } from './_configs';
import { handleCommands } from './_utils/handle-commands';

const props = defineProps<{ id: number }>();

const { $trpc } = useNuxtApp();

// file change sync
const fileChangeSync = useFileChangeSync({
   problemId: props.id,
   ignorePatterns: IGNORE_FILE_PATTERNS,
});

// 监听文件移动/重命名事件
const fileMoveEmitter = useEventBus<{ oldPath: string; newPath: string }>(
   'file-move-event',
);
onMounted(() => {
   fileMoveEmitter.on((data) => {
      fileChangeSync.mv(data.oldPath, data.newPath);
   });
});

// 监听文件删除事件
const fileDeleteEmitter = useEventBus<{
   path: string;
   type: 'file' | 'folder';
}>('file-delete-event');
onMounted(() => {
   fileDeleteEmitter.on((data) => {
      fileChangeSync.rm(data.path);
   });
});

// 监听文件创建事件
const fileCreateEmitter = useEventBus<{
   path: string;
   content: string;
}>('file-create-event');
onMounted(() => {
   fileCreateEmitter.on((data) => {
      fileChangeSync.create(data.path, data.content);
   });
});

// get and parse project file system
const pathContentMap = ref<Record<string, { vid: string; content: string }>>();
const pathTreeNodeMap = ref<Record<string, IFileSystemItem>>();
const fsTree = ref<IFileSystemItem[]>();
const mounted = (() => { let r; const p = new Promise<void>(res => { r = res; }); return { promise: p, resolve: r! }; })();
const getProject = async () => {
   if (!props.id || isNaN(props.id)) {
      throw new Error('Problem ID is required');
   }
   const result = await $trpc.protected.problem.getOrForkProject.query({
      problemId: props.id,
   });
   pathContentMap.value = {};
   result.FileSystem[0]!.files.forEach((file) => {
      // 历史数据里 file.path 可能是相对路径，也可能已经带 /project 前缀。
      // 统一归一化到 /project/...，否则会出现 project/project/... 两层目录。
      pathContentMap.value![toProjectMountPath(file.path)] = {
         content: file.content,
         vid: file.vid,
      };
   });

   const contentMap = objectMap(
      pathContentMap.value,
      ({ value }) => value.content,
   );

   const buildResult = buildFileSystemTree(contentMap);
   fsTree.value = buildResult.rootNodes;
   for (const item of fsTree.value[0]?.children ?? []) {
      if (item.type === 'file') {
         selectedFilePath.value = item.path;
         break;
      }
   }
   pathTreeNodeMap.value = {};
   buildResult.fileNodes.forEach((file) => {
      const path = file.path.startsWith('/') ? file.path : `/${file.path}`;
      pathTreeNodeMap.value![path] = file;
   });

   mountFileSystem(contentMap)
      .then(mounted.resolve)
      .catch((err) => {
         // 挂载失败必须显式处理：否则 mounted.promise 永不 settle，
         // runProject 会永久卡在 await 上，界面停在"正在启动开发容器…"。
         console.error('[challenge] 挂载文件系统失败:', err);
         unsupportedReason.value =
            err?.message ?? '初始化在线开发环境失败';
      });
   return result;
};
onMounted(() => {
   getProject().catch((err) => {
      console.error('[challenge] 加载题目文件失败:', err);
      unsupportedReason.value = err?.message ?? '加载题目文件失败';
   });
});

// file manager
const selectedPath = ref<string>();
const selectedFilePath = ref<string>();

watch(selectedFilePath, (newPath) => {
   newPath && (selectedPath.value = newPath);
});

watch(selectedPath, (newPath) => {
   if (!newPath) return;
   const normalizedPath = normalizePath(newPath);
   const segments = splitPath(normalizedPath).slice(1); // 跳过第一级 (project)
   let currentNode = fsTree.value?.[0]!;
   segments.forEach((segment) => {
      currentNode = currentNode.children!.find(
         (child) => child.name === segment,
      )!;
   });
   if (currentNode.type === 'file') {
      selectedFilePath.value = normalizedPath;
   }
});

// code editor
const codeEditor = useTemplateRef('code-editor');
const pathToRecreate = new Set<string>();

const handleFileClick = (_: IFileSystemItem, wasSuspense: boolean) => {
   // 如果点击的是 suspense 文件，标记需要强制重新创建 model
   wasSuspense && pathToRecreate.add(_.path);
};

onMounted(() => {
   watch(selectedPath, (newPath) => {
      if (!newPath) return;

      codeEditor.value?.setModel(newPath, pathToRecreate.has(newPath));

      pathToRecreate.delete(newPath);
   });

   const contentChangeCallback = (path: string, content: string) => {
      const normalizedPath = normalizePath(path);

      if (
         !pathContentMap.value?.[normalizedPath] ||
         !pathTreeNodeMap.value?.[normalizedPath]
      ) {
         return;
      }

      pathContentMap.value![normalizedPath].content = content;
      pathTreeNodeMap.value![normalizedPath].content = content;
      writeFile(normalizedPath, content);
      fileChangeSync.change(normalizedPath, content);
   };
   const debounceCallback = useDebounceFn(contentChangeCallback, 300);
   codeEditor.value?.onModelContentChange(debounceCallback);
});

// terminal
const {
   mountFileSystem,
   runCommand,
   getInstance,
   exposeServer,
   writeFile,
   onWebContainerFailed,
} = useWebContainer({
   workdirName: 'workspace',
});
const terminal = useTemplateRef('terminal');

// 容器启动失败时的提示状态（由 runProject 与 webcontainer 失败回调共同写入）
const unsupportedReason = ref<string | null>(null);

// WebContainer 自身启动失败时也要落到界面上（必须放在 useWebContainer 之后，
// 否则会在初始化前访问 onWebContainerFailed，触发 TDZ 错误）
onWebContainerFailed((err: any) => {
   unsupportedReason.value =
      err?.message ?? 'WebContainer 启动失败（可能是浏览器不支持跨源隔离）';
});

// run project
const editorStore = useEditorStore();
const currentStep = ref(0);

/**
 * WebContainer 依赖跨源隔离（SharedArrayBuffer）。若 COOP/COEP 响应头被反向代理或
 * CDN 剥离、或浏览器不支持，WebContainer.boot() 会静默失败，页面只会永久停留在
 * "正在启动开发容器…"，用户完全无法判断原因。这里提前检测并给出明确提示。
 */
const checkRuntimeSupport = (): string | null => {
   if (!import.meta.client) return null;

   // 非安全的来源（例如用局域网 IP 走 http 访问）不会有安全上下文，
   // SharedArrayBuffer 直接不可用。这种情况提示要具体，否则很难自己想到。
   const { protocol, hostname } = window.location;
   const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1';

   if (!isLocalhost && protocol !== 'https:') {
      return (
         `当前访问地址是 ${protocol}//${hostname}，既不是 localhost 也不是 HTTPS。` +
         '浏览器只在安全上下文中提供 SharedArrayBuffer，因此在线编辑器无法在此地址运行。' +
         '请改用 http://localhost:3000 访问，或为站点配置 HTTPS。'
      );
   }

   if (typeof SharedArrayBuffer === 'undefined') {
      return '当前浏览器不支持 SharedArrayBuffer。';
   }
   if (!window.crossOriginIsolated) {
      return (
         '页面未处于跨源隔离状态（crossOriginIsolated = false）。' +
         '通常是 COOP/COEP 响应头被反向代理或 CDN 剥离所致，也可能是浏览器扩展干扰。'
      );
   }
   return null;
};

// 把失败原因同步到 store：提交按钮原先只会"变灰且不解释"，
// 用户会以为没有提交按钮。写入后按钮点击时会给出具体原因。
watch(unsupportedReason, (reason) => {
   if (reason) editorStore.initFailureReason = reason;
});

const runProject = async () => {
   // 标记启动流程已开始，便于区分"进行中"与"从未触发"
   editorStore.initStarted = true;

   const reason = checkRuntimeSupport();
   if (reason) {
      unsupportedReason.value = reason;
      console.error('[challenge] 运行环境检查未通过:', reason);
      return;
   }

   const terminalInstance = await terminal.value?.createTerminal();
   const terminalId = terminalInstance?.id;

   // 兜底超时：即使 mounted.promise 因某种原因没有 settle，也不能让界面无限卡住。
   await Promise.race([
      Promise.all([mounted.promise, loaded.promise]),
      new Promise((_, reject) =>
         setTimeout(
            () =>
               reject(
                  new Error(
                     '在线开发环境初始化超时（WebContainer 未能在 60 秒内就绪）',
                  ),
               ),
            60_000,
         ),
      ),
   ]);

   // run boot commands
   editorStore.hasProjectInitialized = false;
   currentStep.value = 1;

   if (problem.value?.bootCommand) {
      const bootCommands = handleCommands(problem.value.bootCommand);
      for (const { command, title } of bootCommands) {
         const process = await runCommand(command);
         await terminal.value!.attachProcess({
            process: process,
            id: terminalId,
            name: title || 'boot-command',
         });
         await process.exit;
      }
   }
   editorStore.hasProjectInitialized = true;

   await terminal.value?.writeTerminal('\n');

   // run shell command (init commands)
   currentStep.value = 2;
   if (problem.value?.initCommand) {
      const shell = await runCommand('sh');
      const initCommands = handleCommands(problem.value.initCommand).slice(
         0,
         1,
      );
      for (const { command, title } of initCommands) {
         const { writer } = await terminal.value!.attachProcess({
            process: shell,
            id: terminalId,
            name: title ?? 'init-command',
         });
         writer.write(`${command}\n`);
      }
   }
};

// 启动失败时不要静默：把原因暴露到界面上
onMounted(() => {
   runProject().catch((error: any) => {
      console.error('[challenge] 启动开发容器失败:', error);
      unsupportedReason.value =
         error?.message || '启动在线开发环境失败，请刷新页面重试。';
   });
});

// handle add terminal
const addTerminal = async () => {
   const process = await runCommand('sh');
   await terminal.value?.createTerminal({ process, name: 'jsh' });
};

// file system loader
const dirLoader = async (dirPath: string) => {
   const webContainer = await getInstance();
   const dir = await webContainer.fs.readdir(dirPath, { withFileTypes: true });
   return dir.map((item) => ({
      name: item.name,
      type: (item.isDirectory() ? 'folder' : 'file') as 'file' | 'folder',
      path: `${dirPath}/${item.name}`,
   }));
};

const fileLoader = async (filePath: string) => {
   const webContainer = await getInstance();
   const content = await webContainer.fs.readFile(filePath, 'utf-8');

   const isNewFile = !pathContentMap.value?.[filePath];

   if (pathContentMap.value) {
      pathContentMap.value[filePath] = { content, vid: '' };
   }

   // 更新 pathTreeNodeMap,确保新创建的文件也能被监听到内容变化
   if (pathTreeNodeMap.value && fsTree.value) {
      const findNode = (
         items: IFileSystemItem[],
         targetPath: string,
      ): IFileSystemItem | null => {
         for (const item of items) {
            if (item.path === targetPath) {
               return item;
            }
            if (item.type === 'folder' && item.children) {
               const found = findNode(item.children, targetPath);
               if (found) return found;
            }
         }
         return null;
      };

      const node = findNode(fsTree.value, filePath);
      if (node && !pathTreeNodeMap.value[filePath]) {
         pathTreeNodeMap.value[filePath] = node;
      }
   }

   // 如果是新文件，同步到云端 (使用 create 而不是 change)
   if (isNewFile) {
      fileChangeSync.create(filePath, content);
   }

   return content;
};

// preview
const previewUrl = ref<string>();
const hostName = ref<string>();
onMounted(() => {
   watch(exposeServer, (server) => {
      if (!server) return;
      previewUrl.value = server.url;
      hostName.value = `localhost:${server.port}`;
   });
});

// get and parse problem detail
const getProblemDetail = async () => {
   if (!props.id || isNaN(props.id)) {
      throw new Error('Problem ID is required');
   }
   return await $trpc.protected.problem.getProblemDetail.query({
      problemId: props.id,
   });
};
const { data: problem } = await useAsyncData(
   `problem-detail-${props.id}`,
   getProblemDetail,
);
const loaded = (() => { let r; const p = new Promise<void>(res => { r = res; }); return { promise: p, resolve: r! }; })();
watch(problem, () => problem.value && loaded.resolve(), { immediate: true });

const appBaseUrl = useRuntimeConfig().public.appBaseUrl;

// command for right-click menu
const { operator } = useCommands({
   runCommand,
   getWebContainerInstance: getInstance,
   fsTree,
});

// handle move item
const handleMoveItem = async (oldPath: string, newPath: string) => {
   try {
      if (!operator) {
         console.error('[ERROR] Operator not ready');
         return;
      }
      await operator.moveItem(oldPath, newPath);
   } catch (error) {
      console.error('[ERROR] Failed to move item:', error);
   }
};

// handle add file
const handleAddFile = async () => {
   try {
      if (!operator) {
         console.error('[ERROR] Operator not ready');
         return;
      }
      const folderPath: string = selectedPath.value
         ? isFolder(selectedPath.value)
            ? normalizePath(selectedPath.value)
            : getParentPath(normalizePath(selectedPath.value))
         : '/project';
      await operator.createFile(folderPath);
   } catch (error) {
      console.error('[ERROR] Failed to add file:', error);
   }
};

const isFolder = (path: string) => {
   const normalizedPath = normalizePath(path);
   const node = pathTreeNodeMap.value?.[normalizedPath];
   return !node || node?.type === 'folder';
};

// handle add folder
const handleAddFolder = async () => {
   try {
      if (!operator) {
         console.error('[ERROR] Operator not ready');
         return;
      }
      const folderPath: string = selectedPath.value
         ? isFolder(selectedPath.value)
            ? normalizePath(selectedPath.value)
            : getParentPath(normalizePath(selectedPath.value))
         : '/project';
      await operator.createDirectory(folderPath);
   } catch (error) {
      console.error('[ERROR] Failed to add folder:', error);
   }
};

// prevent leave
usePreventLeave({
   onPrevent: () => {
      // 离开页面前强制同步
      fileChangeSync.forceSync();
   },
});

// steps
const steps = [
   { idle: '启动开发容器', running: '正在启动开发容器...' },
   { idle: '安装项目依赖', running: '正在安装项目依赖...' },
   { idle: '启动项目', running: '正在启动项目...' },
];

// seo enhancement
//
// 注意：题面是 markdown，里面常带 `<style>` 这类裸标签，**不能**直接塞进 head。
// unhead 只转义 `"` 不转义 `<`，而 nuxt-security 的 nonce 插件会用正则盲扫整段
// HTML（属性值内部也照扫）并注入 nonce="..."，属性会被提前闭合，剩余文本被解析器
// 从 <head> 搬进 <body>，页面上就会多出一段乱码文本。详见 utils/seo-text.ts。
const seoDescription = computed(() =>
   toSeoText(problem.value?.detail).slice(0, 100)
);

useSeoMeta({
   title: `#${props.id} ${problem.value?.title} - Quanta Challenge`,
   description: seoDescription,
   ogTitle: `#${props.id} ${problem.value?.title} - Quanta Challenge`,
   ogDescription: seoDescription,
   ogImage: `${appBaseUrl}/api/static/${problem.value?.coverImageName}`,
   ogUrl: `${appBaseUrl}/challenge/${props.id}`,
   ogSiteName: 'Quanta Challenge',
   ogType: 'website',
   ogLocale: 'zh_CN',
});
</script>

<template>
   <StSpace fill class="pr-4">
      <DetailWindow :markdown="problem?.detail" />
      <CommitModal
         :run-commands="runCommand"
         :get-wc-instance="getInstance"
         :build-command="problem?.buildCommand ?? void 0"
         :upload-dir="problem?.judgeUploadPath ?? void 0"
         :problem-id="id!" />
      <StSpace fill>
         <!--
            三个板块（资源管理器 / 代码编辑器+终端 / 实时预览）由 EditorBoardLayout 承载：
            · 拖动板块左上角的把手到另一个板块位置即可**换位**（顺序持久化）
            · 拖动板块之间的分隔条调整宽度（宽度跟着板块走）
            板块内容通过具名插槽传进去，因此 ref / props 都留在本页，组件不会被重挂。
         -->
         <EditorBoardLayout>
            <template #board-files>
               <FileManagerPanel
                  :dir-loader="dirLoader"
                  :file-loader="fileLoader"
                  :fs-tree="fsTree"
                  :last-sync-time="fileChangeSync.lastSyncTime.value"
                  :is-syncing="fileChangeSync.isSyncing.value"
                  :sync-status="fileChangeSync.syncStatus.value"
                  v-model:selected-path="selectedPath"
                  @move-item="handleMoveItem"
                  @file-click="handleFileClick"
                  @add-file="handleAddFile"
                  @add-folder="handleAddFolder" />
            </template>

            <template #board-code>
               <StSplitPanel
                  direction="vertical"
                  class="size-full"
                  storage-key="editor.code-terminal"
                  :start-percent="65">
                  <template #start>
                     <CodeEditorPanel
                        ref="code-editor"
                        v-model:current-file-path="selectedFilePath"
                        :get-wc-instance="getInstance"
                        :default-fs="pathContentMap" />
                  </template>
                  <template #end="panelMethods">
                     <TerminalPanel
                        ref="terminal"
                        v-bind="panelMethods"
                        @add-terminal="addTerminal" />
                  </template>
               </StSplitPanel>
            </template>

            <template #board-preview>
               <PreviewPanel
                  :steps="steps"
                  :current-step="currentStep"
                  :preview-url="previewUrl"
                  :host-name="hostName"
                  :unsupported-reason="unsupportedReason" />
            </template>
         </EditorBoardLayout>
      </StSpace>
   </StSpace>
</template>

<style src="@/assets/css/utils.css" />
