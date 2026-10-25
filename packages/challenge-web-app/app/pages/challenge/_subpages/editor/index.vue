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
import RequestPanel from './_modules/RequestPanel.vue';
import { useWebContainer } from '../../_composables/use-web-container';
import DetailWindow from './_components/DetailWindow.vue';
import CommitModal from './_components/CommitModal.vue';
import EditorBoardLayout from './_components/EditorBoardLayout.vue';
import { useCommands } from '../../_composables/use-commands/index';
import { useFileChangeSync } from './_composables/use-file-change-sync';
import { useManifestSync } from './_composables/use-manifest-sync';
import { IGNORE_FILE_PATTERNS } from './_configs';
import { handleCommands } from './_utils/handle-commands';
import { useEditorShortcuts } from './_composables/use-editor-shortcuts';
import {
   deleteCachedSnapshotImage,
   readCachedSnapshotImage,
   writeCachedSnapshotImage,
} from './_utils/snapshot-image-cache';
import { useMessage } from '~/components/st/Message/use-message';
import * as Sentry from '@sentry/nuxt';

const props = defineProps<{ id: number }>();

const { $trpc, $authFetch } = useNuxtApp();

// file change sync
// 加载项目时的版本号；重置会递增服务端 revision，旧版本同步请求会被拒绝
const projectRevision = ref<number>();
const fileChangeSync = useFileChangeSync({
   problemId: props.id,
   ignorePatterns: IGNORE_FILE_PATTERNS,
   getRevision: () => projectRevision.value,
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
   projectRevision.value = result.revision;
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
   // 旧版本题目已触发重定向，不再加载其工程文件（重定向后组件会以新 pid 重新挂载）
   if (isOutdatedVersion.value) return;
   getProject().catch((err) => {
      console.error('[challenge] 加载题目文件失败:', err);
      unsupportedReason.value = err?.message ?? '加载题目文件失败';
   });
});

// file manager
const selectedPath = ref<string>();
const selectedFilePath = ref<string>();

watch(selectedFilePath, (newPath) => {
   // 所有 tab 关闭时 newPath 为空字符串，需同步清空文件树选中状态
   selectedPath.value = newPath || undefined;
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
   servers,
   exposeServer,
   writeFile,
   onWebContainerFailed,
} = useWebContainer({
   workdirName: 'workspace',
});
const terminal = useTemplateRef('terminal');

useManifestSync({
   getWebContainerInstance: getInstance,
   onEditorInstanceReady: (callback) =>
      codeEditor.value?.onEditorInstanceReady(callback),
});

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
type BootStep = 'container' | 'snapshot' | 'install' | 'start';
const bootStep = ref<BootStep>('container');
const snapshotStepText = ref('正在拉取快照镜像...');

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

watch(unsupportedReason, (reason) => {
   if (reason) {
      editorStore.initFailureReason = reason;
      Sentry.captureMessage(`在线开发环境启动失败: ${reason}`, 'error');
   }
});

const downloadSnapshotImage = async (
   fileName: string,
   expectedSize: number | null,
) => {
   const response = await $authFetch(
      `/api/static/image-builds/${encodeURIComponent(fileName)}`,
   );
   if (!response.ok) {
      throw new Error(`快照镜像下载失败（HTTP ${response.status}）`);
   }
   // 响应带 Content-Encoding，读到的是解压后的字节，进度按原始大小计算
   if (!response.body || !expectedSize) {
      return new Uint8Array(await response.arrayBuffer());
   }
   const reader = response.body.getReader();
   const chunks: Uint8Array[] = [];
   let received = 0;
   for (; ;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      const percent = Math.min(99, Math.floor((received / expectedSize) * 100));
      snapshotStepText.value = `正在拉取快照镜像... ${percent}%`;
   }
   const bytes = new Uint8Array(received);
   let offset = 0;
   for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
   }
   return bytes;
};

/** 题目绑定快照镜像时，在 bootCommand 之前挂载到工作区根；优先使用本地缓存 */
const loadSnapshotImage = async (): Promise<boolean> => {
   if (!problem.value?.snapshotImageId) return false;
   const build = problem.value.SnapshotImage;
   if (!build) {
      throw new Error('题目绑定的快照镜像不存在或已被删除，请联系发布者');
   }
   if (build.status !== 'ready' || !build.fileName) {
      throw new Error(
         `题目绑定的快照镜像「${build.name}」尚未构建完成，请联系发布者`,
      );
   }
   const { id, name, fileName, sizeBytes } = build;
   const instance = await getInstance();

   const mountSnapshot = async (fromCache: boolean): Promise<number> => {
      let bytes: Uint8Array<ArrayBuffer> | null = null;
      if (fromCache) {
         bytes = await readCachedSnapshotImage(fileName);
         if (bytes && sizeBytes && bytes.byteLength !== sizeBytes) {
            await deleteCachedSnapshotImage(fileName);
            bytes = null;
         }
         if (!bytes) return -1;
         snapshotStepText.value = '正在读取缓存...';
         await terminal.value?.writeTerminal(
            `[image] 命中本地缓存「${name}」\n`,
         );
      } else {
         snapshotStepText.value = '正在拉取快照镜像...';
         await terminal.value?.writeTerminal(
            `[image] 正在拉取快照镜像「${name}」…\n`,
         );
         bytes = await downloadSnapshotImage(fileName, sizeBytes);
         if (bytes.byteLength === 0) {
            throw new Error(`快照镜像「${name}」内容为空，请联系发布者重新上传`);
         }
      }
      const size = bytes.byteLength;
      // mount 会转移 buffer，需在此之前复制出要缓存的内容
      const cacheBlob = fromCache ? null : new Blob([bytes]);
      await instance.mount(bytes);
      if (cacheBlob) void writeCachedSnapshotImage(id, fileName, cacheBlob);
      return size;
   };

   let size = -1;
   try {
      size = await mountSnapshot(true);
   } catch (error) {
      console.warn('[challenge] 缓存的快照镜像挂载失败，改为重新下载:', error);
      await deleteCachedSnapshotImage(fileName);
   }
   if (size < 0) {
      try {
         size = await mountSnapshot(false);
      } catch (error: any) {
         throw new Error(
            `快照镜像「${name}」加载失败：${error?.message ?? error}`,
         );
      }
   }

   // snapshot 不保留执行权限
   const fix = await runCommand([
      'sh',
      '-c',
      'chmod +x node_modules/.bin/* 2>/dev/null; true',
   ]);
   await fix.exit;
   await terminal.value?.writeTerminal(
      `[image] 快照镜像已就绪（${(size / 1024 / 1024).toFixed(1)} MB）\n`,
   );
   return true;
};

/** 挂载快照镜像后，所有 shell 的 PATH 需包含 node_modules/.bin */
let imageEnv: Record<string, string> | undefined;

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

   bootStep.value = 'snapshot';
   if (await loadSnapshotImage()) {
      const instance = await getInstance();
      imageEnv = {
         PATH: `${instance.workdir}/node_modules/.bin:${instance.path}`,
      };
   }

   bootStep.value = 'install';
   if (problem.value?.bootCommand) {
      const bootCommands = handleCommands(problem.value.bootCommand);
      for (const { command, title } of bootCommands) {
         const process = await runCommand(command, { env: imageEnv });
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
   bootStep.value = 'start';
   if (problem.value?.initCommand) {
      const shell = await runCommand('sh', { env: imageEnv });
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
   const process = await runCommand('sh', { env: imageEnv });
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
const previewUrl = computed(() => exposeServer.value?.url);
const preview = useTemplateRef('preview');

// shortcuts
const message = useMessage();
let saveHintShown = false;
useEditorShortcuts({
   onSave: () => {
      if (saveHintShown) return;
      saveHintShown = true;
      message.info('代码会自动保存', '无需手动保存，修改会自动同步到云端');
   },
   onRefreshPreview: () => preview.value?.refresh(),
   onCloseTab: () => codeEditor.value?.closeCurrentTab(),
   onToggleTerminal: () => terminal.value?.toggleFold(),
});

// 版本校验：进入做题页时，若题目不是母题（BaseProblem）的当前版本，
// 重定向到当前版本。旧版本可能已被弃用或取消发布，因此必须在加载
// 题目详情之前完成校验，否则旧版本会直接走 404 而无法跳转。
const { data: resolvedCurrentPid } = await useAsyncData(
   `problem-current-pid-${props.id}`,
   () =>
      $trpc.protected.problem.getCurrentProblemPid.query({
         problemId: props.id,
      }),
);
const resolvedPid = computed(() => resolvedCurrentPid.value?.pid ?? null);
const isOutdatedVersion = computed(
   () => resolvedPid.value != null && resolvedPid.value !== props.id,
);
if (isOutdatedVersion.value) {
   await navigateTo(`/challenge/editor/${resolvedPid.value}`, {
      replace: true,
   });
}

// get and parse problem detail
const getProblemDetail = async () => {
   if (!props.id || isNaN(props.id)) {
      throw new Error('Problem ID is required');
   }
   return await $trpc.protected.problem.getProblemDetail.query({
      problemId: props.id,
   });
};
const { data: problem, error: problemError } = await useAsyncData(
   `problem-detail-${props.id}`,
   getProblemDetail,
);
// 服务端判定：题目不存在或未发布（含被取消发布）时，SSR 阶段直接渲染 404 页面，
// 防止通过 URL 直达未发布题目。其他错误原样抛出，避免掩盖真实故障。
if (problemError.value) {
   if ((problemError.value as any)?.data?.code === 'NOT_FOUND') {
      throw createError({
         statusCode: 404,
         fatal: true,
         statusMessage: '题目不存在或未发布',
      });
   }
   throw problemError.value;
}
const loaded = (() => { let r; const p = new Promise<void>(res => { r = res; }); return { promise: p, resolve: r! }; })();
watch(problem, () => problem.value && loaded.resolve(), { immediate: true });

const isBackendService = computed(
   () => problem.value?.problemType === 'backend_service',
);

// 预览板块的标题跟着题型走（拖拽把手上的提示文案）
const previewBoardLabel = computed(() =>
   isBackendService.value ? '接口调试' : '实时预览',
);

const backendServicePort = computed(
   () => exposeServer.value?.port ?? problem.value?.servicePort ?? 3000,
);

watch(
   problem,
   (value) => {
      editorStore.cloudFunctionEnabled = !!value?.enableCloudFunction;
   },
   { immediate: true },
);
const appBaseUrl = useRuntimeConfig().public.appBaseUrl;

// command for right-click menu
const { operator } = useCommands({
   runCommand,
   getWebContainerInstance: getInstance,
   fsTree,
   // 终端等场景直接操作 WebContainer 文件系统时，diff 出的变更也走云端同步
   onFsChange: (changes) => {
      for (const change of changes) {
         if (change.type === 'rm') {
            fileChangeSync.rm(change.path);
         } else if (change.type === 'mv') {
            fileChangeSync.mv(change.oldPath, change.newPath);
         } else if (change.type === 'change') {
            fileChangeSync.change(change.path, change.content);
         } else {
            fileChangeSync.create(change.path, change.content);
         }
      }
   },
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
const { enable: preventLeaveEnabled } = usePreventLeave({
   onPrevent: () => {
      // 离开页面前强制同步
      fileChangeSync.forceSync();
   },
});

// 错误提示组件的「重试」会整页 reload：先关掉离开拦截，避免浏览器弹"确认离开"框
useEventBus('editor-env-retry').on(() => {
   preventLeaveEnabled.value = false;
});

// 设置菜单的「重置题目」：冲刷挂起的文件同步后重置服务端项目，再整页重载重建容器
const { event: resetProjectEvent } = useEventEmitter<{ at: number }>(
   'challenge-settings',
   'reset-project',
);
watch(resetProjectEvent, async (val) => {
   if (!val) return;
   preventLeaveEnabled.value = false;
   try {
      await fileChangeSync.forceSync();
      // forceSync 只处理排队中的变更，还需等待在途请求写完，避免旧内容覆盖重置结果
      while (fileChangeSync.isSyncing.value) {
         await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await $trpc.protected.problem.resetProject.mutate({
         problemId: props.id,
      });
   } catch (error) {
      console.error('[challenge] 重置题目失败:', error);
   } finally {
      window.location.reload();
   }
});

// steps
const steps = computed(() =>
   [
      { key: 'container', idle: '启动开发容器', running: '正在启动开发容器...' },
      problem.value?.snapshotImageId && {
         key: 'snapshot',
         idle: '拉取快照镜像',
         running: snapshotStepText.value,
      },
      { key: 'install', idle: '安装项目依赖', running: '正在安装项目依赖...' },
      { key: 'start', idle: '启动项目', running: '正在启动项目...' },
   ].filter((step): step is { key: BootStep; idle: string; running: string } =>
      Boolean(step),
   ),
);
const currentStep = computed(() =>
   Math.max(
      0,
      steps.value.findIndex((step) => step.key === bootStep.value),
   ),
);

// seo enhancement 注意：题面是 markdown，里面常带 `<style>` 这类裸标签，**不能**直接塞进 head。 unhead 只转义 `"` 不转义 `<`，而 nuxt-security 的 nonce 插件会用正则盲扫整段 HTML（属性值内部也照扫）并注入 nonce="..."，属性会被提前闭合，剩余文本被解析器 从 <head> 搬进 <body>，页面上就会多出一段乱码文本。详见 utils/seo-text.ts。
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
   <StSpace fill>
      <DetailWindow :markdown="problem?.detail" />
      <CommitModal :run-commands="runCommand" :get-wc-instance="getInstance"
         :build-command="problem?.buildCommand ?? void 0" :upload-dir="problem?.judgeUploadPath ?? void 0"
         :problem-id="id!" />
      <StSpace fill>
         <EditorBoardLayout :preview-label="previewBoardLabel">
            <template #board-files>
               <FileManagerPanel :dir-loader="dirLoader" :file-loader="fileLoader" :fs-tree="fsTree"
                  :last-sync-time="fileChangeSync.lastSyncTime.value" :is-syncing="fileChangeSync.isSyncing.value"
                  :sync-status="fileChangeSync.syncStatus.value" v-model:selected-path="selectedPath"
                  @move-item="handleMoveItem" @file-click="handleFileClick" @add-file="handleAddFile"
                  @add-folder="handleAddFolder" />
            </template>

            <template #board-code>
               <StSplitPanel direction="vertical" class="size-full" storage-key="editor.code-terminal"
                  :start-percent="65">
                  <template #start>
                     <CodeEditorPanel ref="code-editor" v-model:current-file-path="selectedFilePath"
                        :get-wc-instance="getInstance" :default-fs="pathContentMap" />
                  </template>
                  <template #end="panelMethods">
                     <TerminalPanel ref="terminal" v-bind="panelMethods" @add-terminal="addTerminal" />
                  </template>
               </StSplitPanel>
            </template>

            <template #board-preview>
               <RequestPanel v-if="isBackendService" :port="backendServicePort" :server-ready="!!exposeServer"
                  :steps="steps" :current-step="currentStep" :unsupported-reason="unsupportedReason"
                  :get-wc-instance="getInstance" :write-file="writeFile" />
               <PreviewPanel v-else ref="preview" :steps="steps" :current-step="currentStep" :preview-url="previewUrl"
                  :servers="servers" :unsupported-reason="unsupportedReason" />
            </template>
         </EditorBoardLayout>
      </StSpace>
   </StSpace>
</template>

<style src="@/assets/css/utils.css" />
