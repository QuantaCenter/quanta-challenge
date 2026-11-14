<script setup lang="ts">
import dayjs from 'dayjs';
import {
   DatabaseSync,
   LinkCloudFaild,
   LinkCloudSucess,
   LoadingFour,
} from '@icon-park/vue-next';
import authGuard from '~/middlewares/auth-guard';
import { buildFileSystemTree } from '~/utils/fs-tree';
import { encodeSnapshotFile, moveSnapshotFiles } from '~/utils/snapshot-file';
import { getParentPath, normalizePath, splitPath } from '~/utils/path-utils';
import { checkWebContainerSupport } from '~/utils/webcontainer-support';
import { formatFileSize } from '~/utils/format-file-size';
import type { IFileSystemItem } from '~/components/st/FileSystemTree/type';
import { useMessage } from '~/components/st/Message/use-message';
import { useEventEmitter } from '~/composables/use-event-emitter';
import { useWebContainer } from '~/pages/challenge/_composables/use-web-container';
import { useCommands } from '~/pages/challenge/_composables/use-commands/index';
import FileManagerPanel from '~/pages/challenge/_subpages/editor/_modules/FileManagerPanel.vue';
import CodeEditorPanel from '~/pages/challenge/_subpages/editor/_modules/CodeEditorPanel.vue';
import TerminalPanel from '~/pages/challenge/_subpages/editor/_modules/TerminalPanel.vue';
import PreviewPanel from '~/pages/challenge/_subpages/editor/_modules/PreviewPanel.vue';
import EditorBoardLayout from '~/pages/challenge/_subpages/editor/_components/EditorBoardLayout.vue';
import { useManifestSync } from '~/pages/challenge/_subpages/editor/_composables/use-manifest-sync';
import { useEditorShortcuts } from '~/pages/challenge/_subpages/editor/_composables/use-editor-shortcuts';
import { useFileChangeSync } from '~/pages/challenge/_subpages/editor/_composables/use-file-change-sync';
import { IGNORE_FILE_PATTERNS } from '~/pages/challenge/_subpages/editor/_configs';
import { mountSnapshotImage } from '~/pages/challenge/_subpages/editor/_utils/mount-snapshot-image';
import type { IUploadItem } from '~/pages/challenge/_subpages/editor/_utils/upload-item';

definePageMeta({
   // 布局由父路由 pages/workshop.vue 提供（app.vue 没有 <NuxtLayout>，这里写 layout 不生效）
   middleware: [authGuard],
   key: (route) => route.fullPath,
});

/**
 * 工坊 IDE：复用做题页的 IDE 组件（文件树 / Monaco / 终端 / 预览 / 可拖拽布局），
 * 项目文件保存在服务端（WorkshopProject），编辑、终端操作与上传都会同步到云端。
 */

const route = useRoute();
const projectId = String(route.params.id ?? '');
const { $trpc, $authFetch } = useNuxtApp();
const limits = useRuntimeConfig().public.workshop;

const { data, error: loadError } = await useAsyncData(`workshop-project-${projectId}`, () =>
   $trpc.protected.workshop.get.query({ id: projectId }),
);
if (loadError.value || !data.value) {
   const code = (loadError.value as any)?.data?.code;
   throw createError({
      statusCode: code === 'NOT_FOUND' || !loadError.value ? 404 : 500,
      statusMessage: code === 'NOT_FOUND' || !loadError.value ? '项目不存在' : '加载项目失败',
      fatal: true,
   });
}
const project = ref(data.value.project);
/** 项目使用的模板（含管理员的覆盖配置）；模板被删除时为 null */
const template = data.value.template;

/** WebContainer 工作区内的项目目录（与做题页一致挂载在 /project 下） */
const PROJECT_DIR = 'project';
const PROJECT_ROOT = `/${PROJECT_DIR}`;

const hasPackageJson = data.value.files.some(
   (file) => file.path === `${PROJECT_ROOT}/package.json`,
);
/** 模板被删除时按项目内容推断启动方式 */
const installCommand = project.value.source === 'github' ? undefined : template
   ? template.installCommand || undefined
   : hasPackageJson
     ? 'npm install'
     : undefined;
const defaultStartCommand = project.value.source === 'github' ? '' : template
   ? template.startCommand
   : hasPackageJson
     ? 'npm run dev'
     : 'npx --yes serve -l 3000 .';
const startCommand = project.value.startCommand ?? defaultStartCommand;
const settingsOpened = ref(false);
const { event: settingsEvent, off: offSettings } = useEventEmitter<{ at: number }>('workshop', 'settings');
watch(settingsEvent, (value) => {
   if (value) settingsOpened.value = true;
});
onUnmounted(offSettings);
const snapshotImage = template?.snapshotImage ?? null;

const message = useMessage();
const editorStore = useEditorStore();
const layoutStore = useLayoutStore();
const isMobile = useIsMobile();

// ————————————————— WebContainer —————————————————
const {
   mountFileSystem,
   runCommand,
   getInstance,
   servers,
   exposeServer,
   writeFile,
   onWebContainerFailed,
} = useWebContainer({ workdirName: 'workspace' });

const unsupportedReason = ref<string | null>(null);
onWebContainerFailed((err: any) => {
   unsupportedReason.value =
      err?.message ?? 'WebContainer 启动失败（可能是浏览器不支持跨源隔离）';
});

// ————————————————— 云端同步 —————————————————
const projectSize = ref(project.value.sizeBytes);
const fileChangeSync = useFileChangeSync({
   ignorePatterns: IGNORE_FILE_PATTERNS,
   getRevision: () => project.value.revision,
   conflictMessage: '项目已被重置，本地未同步的修改已丢弃，请刷新页面',
   send: async (changes, revision) => {
      const result = await $trpc.protected.workshop.sync.mutate({
         id: projectId,
         changes,
         revision,
      });
      if (result.sizeBytes !== null) projectSize.value = result.sizeBytes;
      return result;
   },
});

// ————————————————— 文件状态 —————————————————
const pathContentMap = ref<Record<string, { vid: string; content: string }>>();
const pathTreeNodeMap = ref<Record<string, IFileSystemItem>>();
const fsTree = ref<IFileSystemItem[]>();
const selectedPath = ref<string>();
const selectedFilePath = ref<string>();

const removeContentPaths = (path: string) => {
   for (const key of Object.keys(pathContentMap.value ?? {})) {
      if (key === path || key.startsWith(`${path}/`)) {
         delete pathContentMap.value![key];
      }
   }
};
const moveContentPaths = (oldPath: string, newPath: string) => {
   if (pathContentMap.value) {
      moveSnapshotFiles(pathContentMap.value, oldPath, newPath);
   }
};

let resolveMounted!: () => void;
const mounted = new Promise<void>((resolve) => {
   resolveMounted = resolve;
});

type BootStep = 'download' | 'container' | 'snapshot' | 'install' | 'start';
const bootStep = ref<BootStep>('container');
const projectFilesLoaded = ref(false);
const assetFiles = data.value.files.filter((file) => file.assetId);
const downloadStepText = ref('正在下载项目文件...');
const snapshotStepText = ref('正在拉取快照镜像...');

/** 二进制文件（图片、上传的资源等）按需下载原始字节，避免在 JSON 里传输 base64 */
const downloadAssets = async () => {
   const result: Record<string, string> = {};
   let done = 0;
   const queue = [...assetFiles];
   const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
         const response = await $authFetch(
            `/api/workshop/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(file.assetId!)}`,
         );
         if (!response.ok) {
            throw new Error(`下载文件 ${file.path} 失败（HTTP ${response.status}）`);
         }
         const bytes = new Uint8Array(await response.arrayBuffer());
         result[file.path] = encodeSnapshotFile(file.path, bytes);
         done += 1;
         downloadStepText.value = `正在下载项目文件... ${done}/${assetFiles.length}`;
      }
   };
   await Promise.all(Array.from({ length: 4 }, worker));
   return result;
};

const loadProject = async () => {
   const contentMap: Record<string, string> = {};
   for (const file of data.value!.files) {
      if (file.content !== null) contentMap[normalizePath(file.path)] = file.content;
   }
   if (assetFiles.length) {
      bootStep.value = 'download';
      Object.assign(contentMap, await downloadAssets());
      bootStep.value = 'container';
   }
   projectFilesLoaded.value = true;

   pathContentMap.value = {};
   for (const [path, content] of Object.entries(contentMap)) {
      pathContentMap.value[path] = { content, vid: '' };
   }

   const buildResult = buildFileSystemTree(contentMap);
   // 空项目也要有 /project 根节点，否则无法新建 / 上传文件
   fsTree.value = buildResult.rootNodes.length
      ? buildResult.rootNodes
      : [{ name: PROJECT_DIR, path: PROJECT_ROOT, type: 'folder', children: [] }];
   pathTreeNodeMap.value = {};
   buildResult.fileNodes.forEach((file) => {
      pathTreeNodeMap.value![normalizePath(file.path)] = file;
   });

   const entryPath = template ? normalizePath(`${PROJECT_ROOT}/${template.entry}`) : '';
   selectedFilePath.value = contentMap[entryPath]
      ? entryPath
      : Object.keys(contentMap).find((path) => !path.includes('/node_modules/'));

   const fsForMount = Object.keys(contentMap).length
      ? contentMap
      : { [`${PROJECT_ROOT}/.keep`]: '' };
   await mountFileSystem(fsForMount);
   resolveMounted();
};

// 文件树选中 -> 打开文件
watch(selectedFilePath, (newPath) => {
   selectedPath.value = newPath || undefined;
});
watch(selectedPath, (newPath) => {
   if (!newPath) return;
   const normalizedPath = normalizePath(newPath);
   const node = pathTreeNodeMap.value?.[normalizedPath];
   if (node?.type === 'file') {
      selectedFilePath.value = normalizedPath;
      return;
   }
   // 新建 / 懒加载的文件不在 map 中，沿树查找
   let current: IFileSystemItem | undefined = fsTree.value?.[0];
   for (const segment of splitPath(normalizedPath).slice(1)) {
      current = current?.children?.find((child) => child.name === segment);
   }
   if (current?.type === 'file') {
      selectedFilePath.value = normalizedPath;
   }
});

// 移动端在抽屉文件树里选中文件后：关闭抽屉并滑到代码板块
watch(selectedFilePath, (newPath) => {
   if (!isMobile.value || !newPath || !editorStore.mobileFileDrawerOpened) {
      return;
   }
   editorStore.mobileFileDrawerOpened = false;
   editorStore.mobileBoardJump = { board: 'code', at: Date.now() };
});

// ————————————————— 文件操作事件（右键菜单 / 拖拽 / 终端） —————————————————
const fileMoveEmitter = useEventBus<{ oldPath: string; newPath: string }>(
   'file-move-event',
);
const fileDeleteEmitter = useEventBus<{ path: string; type: 'file' | 'folder' }>(
   'file-delete-event',
);
const fileCreateEmitter = useEventBus<{ path: string; content: string }>(
   'file-create-event',
);
const onFileMove = (event: { oldPath: string; newPath: string }) => {
   moveContentPaths(event.oldPath, event.newPath);
   fileChangeSync.mv(event.oldPath, event.newPath);
};
const onFileDelete = (event: { path: string }) => {
   removeContentPaths(event.path);
   fileChangeSync.rm(event.path);
};
const onFileCreate = (event: { path: string; content: string }) => {
   if (pathContentMap.value) {
      pathContentMap.value[normalizePath(event.path)] = {
         content: event.content,
         vid: '',
      };
   }
   fileChangeSync.create(event.path, event.content);
};
onMounted(() => {
   fileMoveEmitter.on(onFileMove);
   fileDeleteEmitter.on(onFileDelete);
   fileCreateEmitter.on(onFileCreate);
});
onUnmounted(() => {
   fileMoveEmitter.off(onFileMove);
   fileDeleteEmitter.off(onFileDelete);
   fileCreateEmitter.off(onFileCreate);
});

const isInsideNodeModules = (path: string) => /(^|\/)node_modules\/./.test(path);

/**
 * 已通过上传接口保存到云端的文件：写入 WebContainer 后文件监听会再报告一次，
 * 内容一致时跳过，避免把大文件再经 tRPC 同步一遍。
 */
const uploadedContents = new Map<string, string>();

const { operator } = useCommands({
   runCommand,
   getWebContainerInstance: getInstance,
   fsTree,
   // node_modules 目录本身会出现在文件树中，但其内部不参与 diff，避免装包时整树读取
   ignorePath: isInsideNodeModules,
   // 终端等场景直接操作 WebContainer 文件系统时，diff 出的变更也同步到云端
   onFsChange: (changes) => {
      for (const change of changes) {
         if (change.type === 'rm') {
            removeContentPaths(change.path);
            fileChangeSync.rm(change.path);
         } else if (change.type === 'mv') {
            moveContentPaths(change.oldPath, change.newPath);
            fileChangeSync.mv(change.oldPath, change.newPath);
         } else {
            if (pathContentMap.value) {
               pathContentMap.value[change.path] = {
                  content: change.content,
                  vid: pathContentMap.value[change.path]?.vid ?? '',
               };
            }
            const uploaded = uploadedContents.get(change.path);
            if (uploaded !== undefined) {
               uploadedContents.delete(change.path);
               if (uploaded === change.content) continue;
            }
            if (change.type === 'change') {
               fileChangeSync.change(change.path, change.content);
            } else {
               fileChangeSync.create(change.path, change.content);
            }
         }
      }
   },
});

const isFolder = (path: string) => {
   const node = pathTreeNodeMap.value?.[normalizePath(path)];
   return !node || node.type === 'folder';
};
const targetFolder = () =>
   selectedPath.value
      ? isFolder(selectedPath.value)
         ? normalizePath(selectedPath.value)
         : getParentPath(normalizePath(selectedPath.value))
      : PROJECT_ROOT;
const uploadTargetLabel = computed(() => {
   const folder = selectedPath.value
      ? isFolder(selectedPath.value)
         ? normalizePath(selectedPath.value)
         : getParentPath(normalizePath(selectedPath.value))
      : PROJECT_ROOT;
   return folder === PROJECT_ROOT ? '项目根目录' : folder.slice(PROJECT_ROOT.length + 1);
});

const handleAddFile = async () => {
   try {
      await operator.createFile(targetFolder());
   } catch (error) {
      console.error('[workshop] 新建文件失败:', error);
   }
};
const handleAddFolder = async () => {
   try {
      await operator.createDirectory(targetFolder());
   } catch (error) {
      console.error('[workshop] 新建文件夹失败:', error);
   }
};
const handleMoveItem = async (oldPath: string, newPath: string) => {
   try {
      await operator.moveItem(oldPath, newPath);
   } catch (error) {
      console.error('[workshop] 移动文件失败:', error);
   }
};

// 文件树懒加载（终端里新建的文件、node_modules 等）
const dirLoader = async (dirPath: string) => {
   const wc = await getInstance();
   const dir = await wc.fs.readdir(dirPath, { withFileTypes: true });
   return dir.map((item) => ({
      name: item.name,
      type: (item.isDirectory() ? 'folder' : 'file') as 'file' | 'folder',
      path: `${dirPath}/${item.name}`,
   }));
};
const fileLoader = async (filePath: string) => {
   const wc = await getInstance();
   const bytes = await wc.fs.readFile(filePath);
   const content = encodeSnapshotFile(filePath, bytes);
   const normalizedPath = normalizePath(filePath);
   if (pathContentMap.value) {
      pathContentMap.value[normalizedPath] = {
         content,
         vid: pathContentMap.value[normalizedPath]?.vid ?? '',
      };
   }
   return content;
};

// ————————————————— 上传 —————————————————
const projectReady = ref(false);
const uploadProgress = ref<{ done: number; total: number; current: string } | null>(
   null,
);

const readUploadError = async (response: Response) => {
   try {
      const body = await response.json();
      return body?.data?.message || body?.message || `HTTP ${response.status}`;
   } catch {
      return `HTTP ${response.status}`;
   }
};

const uploadFiles = async (items: IUploadItem[]) => {
   if (!projectReady.value) {
      message.warning('请稍候', '开发容器尚未就绪，暂时无法上传');
      return;
   }
   if (uploadProgress.value) {
      message.warning('正在上传', '请等待当前上传完成');
      return;
   }
   const folder = targetFolder();
   const oversize = items.filter((item) => item.file.size > limits.maxFileBytes);
   const accepted = items.filter(
      (item) =>
         item.file.size <= limits.maxFileBytes &&
         !/(^|\/)(node_modules|\.git)(\/|$)/.test(item.relativePath),
   );
   if (oversize.length) {
      message.warning(
         `${oversize.length} 个文件超过 ${formatFileSize(limits.maxFileBytes)}，已跳过`,
         oversize.map((item) => item.relativePath).slice(0, 3).join('、'),
      );
   }
   const totalBytes = accepted.reduce((sum, item) => sum + item.file.size, 0);
   if (projectSize.value + totalBytes > limits.maxProjectBytes) {
      message.error(
         '项目空间不足',
         `本次上传 ${formatFileSize(totalBytes)}，剩余可用 ${formatFileSize(Math.max(0, limits.maxProjectBytes - projectSize.value))}`,
      );
      return;
   }
   if (!accepted.length) return;

   // 先把编辑器里尚未同步的改动推上去，避免上传覆盖后又被旧改动写回
   await fileChangeSync.forceSync();

   let succeeded = 0;
   uploadProgress.value = { done: 0, total: accepted.length, current: '' };
   try {
      for (const item of accepted) {
         const path = normalizePath(`${folder}/${item.relativePath}`);
         uploadProgress.value.current = item.relativePath;
         const query = new URLSearchParams({
            path,
            revision: String(project.value.revision),
         });
         const response = await $authFetch(
            `/api/workshop/projects/${encodeURIComponent(projectId)}/files?${query}`,
            {
               method: 'PUT',
               headers: { 'Content-Type': 'application/octet-stream' },
               body: item.file,
            },
         );
         if (!response.ok) {
            message.error(`上传失败：${item.relativePath}`, await readUploadError(response));
            // 空间不足或版本冲突时后续文件也不会成功
            if (response.status === 413 || response.status === 409) break;
            continue;
         }
         const result = (await response.json()) as { projectSizeBytes: number | null };
         if (result.projectSizeBytes !== null) projectSize.value = result.projectSizeBytes;

         const bytes = new Uint8Array(await item.file.arrayBuffer());
         const content = encodeSnapshotFile(path, bytes);
         uploadedContents.set(path, content);
         if (pathContentMap.value) {
            pathContentMap.value[path] = {
               content,
               vid: pathContentMap.value[path]?.vid ?? '',
            };
         }
         await writeFile(path, bytes);
         succeeded += 1;
         uploadProgress.value.done = succeeded;
      }
   } catch (error: any) {
      console.error('[workshop] 上传失败:', error);
      message.error('上传失败', error?.message ?? String(error));
   } finally {
      uploadProgress.value = null;
   }
   if (succeeded) {
      message.success(`已上传 ${succeeded} 个文件`, `保存到 ${uploadTargetLabel.value}`);
   }
};

const uploadInput = useTemplateRef<HTMLInputElement>('upload-input');
const onUploadInputChange = (event: Event) => {
   const input = event.target as HTMLInputElement;
   const files = Array.from(input.files ?? []);
   input.value = '';
   if (files.length) {
      void uploadFiles(files.map((file) => ({ file, relativePath: file.name })));
   }
};
const { event: uploadEvent } = useEventEmitter<{ at: number }>('workshop', 'upload');
watch(uploadEvent, (value) => {
   if (value) uploadInput.value?.click();
});

// ————————————————— 编辑器 —————————————————
const codeEditor = useTemplateRef('code-editor');
const pathToRecreate = new Set<string>();
const handleFileClick = (item: IFileSystemItem, wasSuspense: boolean) => {
   wasSuspense && pathToRecreate.add(item.path);
};

useManifestSync({
   getWebContainerInstance: getInstance,
   onEditorInstanceReady: (callback) =>
      codeEditor.value?.onEditorInstanceReady(callback),
});

// ————————————————— 终端 / 启动流程 —————————————————
const terminal = useTemplateRef('terminal');

const steps = computed(() =>
   [
      assetFiles.length > 0 && {
         key: 'download',
         idle: '下载项目文件',
         running: downloadStepText.value,
      },
      { key: 'container', idle: '启动开发容器', running: '正在启动开发容器...' },
      snapshotImage && {
         key: 'snapshot',
         idle: '挂载快照镜像',
         running: snapshotStepText.value,
      },
      installCommand && {
         key: 'install',
         idle: '安装项目依赖',
         running: '正在安装项目依赖...',
      },
      startCommand && {
         key: 'start',
         idle: '启动开发服务器',
         running: '正在启动开发服务器...',
      },
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

watch(unsupportedReason, (reason) => {
   if (reason) editorStore.initFailureReason = reason;
});

/** 挂载快照镜像后，所有 shell 的 PATH 需包含工作区根的 node_modules/.bin */
let imageEnv: Record<string, string> | undefined;

/** 模板绑定了快照镜像时挂载到工作区根；失败不阻断启动，退回到直接安装依赖 */
const loadSnapshotImage = async () => {
   if (!snapshotImage) return;
   bootStep.value = 'snapshot';
   try {
      await mountSnapshotImage({
         build: snapshotImage,
         getInstance,
         runCommand: (command) => runCommand(command),
         fetcher: (url) => $authFetch(url),
         onProgress: (text) => {
            snapshotStepText.value = text;
         },
         log: (text) => terminal.value?.writeTerminal(text),
         owner: '模板',
         contact: '管理员',
         scope: 'workshop',
      });
      const instance = await getInstance();
      imageEnv = {
         PATH: `${instance.workdir}/node_modules/.bin:${instance.path}`,
      };
   } catch (error: any) {
      console.error('[workshop] 挂载快照镜像失败:', error);
      message.warning('快照镜像加载失败', error?.message ?? String(error));
      await terminal.value?.writeTerminal(
         `[image] 快照镜像加载失败，已跳过：${error?.message ?? error}\n`,
      );
   }
};

const runProject = async () => {
   editorStore.initStarted = true;
   editorStore.hasProjectInitialized = false;

   const reason = checkWebContainerSupport();
   if (reason) {
      unsupportedReason.value = reason;
      return;
   }

   const terminalInstance = await terminal.value?.createTerminal();
   const terminalId = terminalInstance?.id;

   let timer: ReturnType<typeof setTimeout> | undefined;
   await Promise.race([
      mounted,
      new Promise((_, reject) => {
         timer = setTimeout(
            () =>
               reject(
                  new Error(
                     '在线开发环境初始化超时（WebContainer 未能在 90 秒内就绪）',
                  ),
               ),
            90_000,
         );
      }),
   ]).finally(() => clearTimeout(timer));

   projectReady.value = true;

   await loadSnapshotImage();

   if (installCommand) {
      bootStep.value = 'install';
      const install = await runCommand(
         ['sh', '-c', `cd ${PROJECT_DIR} && ${installCommand}`],
         { env: imageEnv },
      );
      await terminal.value!.attachProcess({
         process: install,
         id: terminalId,
         name: 'install',
      });
      const code = await install.exit;
      if (code !== 0) {
         message.warning(
            '依赖安装失败',
            `可在终端中查看日志，并在 ${PROJECT_DIR} 目录下手动执行 ${installCommand}`,
         );
      }
   }
   editorStore.hasProjectInitialized = true;
   await terminal.value?.writeTerminal('\n');

   // 启动命令写入交互式 shell：Ctrl+C 停止后可以继续在终端里操作；没有启动命令（空白项目）时只进入项目目录
   if (startCommand) bootStep.value = 'start';
   const shell = await runCommand('sh', { env: imageEnv });
   const { writer } = await terminal.value!.attachProcess({
      process: shell,
      id: terminalId,
      name: 'dev',
   });
   writer.write(
      startCommand
         ? `cd ${PROJECT_DIR} && ${startCommand}\n`
         : `cd ${PROJECT_DIR}\n`,
   );
};

const addTerminal = async () => {
   const process = await runCommand('sh', { env: imageEnv });
   const created = await terminal.value?.createTerminal({ process, name: 'jsh' });
   created?.attachResult?.writer.write(`cd ${PROJECT_DIR}\n`);
};

onMounted(() => {
   // 先注册编辑器联动，再加载文件，保证首个选中文件能打开
   watch(selectedPath, (newPath) => {
      if (!newPath) return;
      codeEditor.value?.setModel(newPath, pathToRecreate.has(newPath));
      pathToRecreate.delete(newPath);
   });

   const onContentChange = (path: string, content: string) => {
      const normalizedPath = normalizePath(path);
      if (
         !pathContentMap.value?.[normalizedPath] ||
         !pathTreeNodeMap.value?.[normalizedPath]
      ) {
         return;
      }
      pathContentMap.value[normalizedPath].content = content;
      pathTreeNodeMap.value[normalizedPath].content = content;
      writeFile(normalizedPath, content).catch((error) =>
         console.error('[workshop] 写入文件失败:', error),
      );
      fileChangeSync.change(normalizedPath, content);
   };
   codeEditor.value?.onModelContentChange(useDebounceFn(onContentChange, 300));

   loadProject().catch((error: any) => {
      console.error('[workshop] 加载项目失败:', error);
      unsupportedReason.value = error?.message ?? '加载项目失败';
   });

   runProject().catch((error: any) => {
      console.error('[workshop] 启动开发容器失败:', error);
      unsupportedReason.value =
         error?.message || '启动在线开发环境失败，请刷新页面重试。';
   });
});

// ————————————————— 离开保护 —————————————————
const { enable: preventLeaveEnabled } = usePreventLeave({
   onPrevent: () => {
      void fileChangeSync.forceSync();
   },
});
useEventBus('editor-env-retry').on(() => {
   preventLeaveEnabled.value = false;
});

// ————————————————— 预览 / 快捷键 —————————————————
const previewUrl = computed(() => exposeServer.value?.url);
const preview = useTemplateRef('preview');

useEditorShortcuts({
   onSave: () => {
      void fileChangeSync.forceSync();
   },
   onRefreshPreview: () => preview.value?.refresh(),
   onCloseTab: () => codeEditor.value?.closeCurrentTab(),
   onToggleFiles: () => {
      layoutStore.filesVisible = !layoutStore.filesVisible;
   },
   onToggleTerminal: () => {
      editorStore.terminalVisible = !editorStore.terminalVisible;
   },
   onFormat: () => codeEditor.value?.formatDocument(),
});

// ————————————————— 侧边栏：下载 / 重置 —————————————————
const { event: downloadEvent } = useEventEmitter<{ at: number }>('workshop', 'download');
watch(downloadEvent, async (value) => {
   if (!value) return;
   if (!projectReady.value) {
      message.warning('请稍候', '开发容器尚未就绪，暂时无法下载');
      return;
   }
   try {
      const wc = await getInstance();
      const zip = await wc.export(PROJECT_DIR, {
         format: 'zip',
         excludes: ['node_modules', 'node_modules/**', '**/node_modules/**', '.git/**'],
      });
      const url = URL.createObjectURL(
         new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.value.name}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
   } catch (error: any) {
      console.error('[workshop] 导出项目失败:', error);
      message.error('下载失败', error?.message ?? String(error));
   }
});

// 二次确认已在项目设置抽屉中完成。
const { event: resetEvent } = useEventEmitter<{ at: number }>('workshop', 'reset');
watch(resetEvent, async (value) => {
   if (!value) return;
   preventLeaveEnabled.value = false;
   try {
      await $trpc.protected.workshop.reset.mutate({ id: projectId });
      window.location.reload();
   } catch (error: any) {
      message.error('重置失败', error?.message ?? String(error));
      preventLeaveEnabled.value = true;
   }
});

// ————————————————— 资源管理器底部状态 —————————————————
const usagePercent = computed(() =>
   Math.min(100, (projectSize.value / limits.maxProjectBytes) * 100),
);
const syncState = computed(() => {
   if (uploadProgress.value) {
      return {
         Icon: LoadingFour,
         spinning: true,
         text: `正在上传 ${uploadProgress.value.done + 1}/${uploadProgress.value.total}：${uploadProgress.value.current}`,
      };
   }
   const status = fileChangeSync.syncStatus.value;
   const time = fileChangeSync.lastSyncTime.value;
   const timeText = time ? dayjs(time).format('HH:mm:ss') : '';
   if (status === 'syncing') {
      return { Icon: LoadingFour, spinning: true, text: '正在同步到云端...' };
   }
   if (status === 'error') {
      return {
         Icon: LinkCloudFaild,
         spinning: false,
         text: timeText ? `云同步失败 · 上次成功: ${timeText}` : '同步失败',
      };
   }
   return {
      Icon: timeText ? LinkCloudSucess : DatabaseSync,
      spinning: false,
      text: timeText ? `已同步到云端 · ${timeText}` : '已保存在云端',
   };
});

useSeoMeta({
   title: `${project.value.name} - 工坊 - Quanta Challenge`,
   description: project.value.description || template?.description,
});
</script>

<template>
   <StSpace fill>
      <WorkshopSettingsDrawer
         v-model:opened="settingsOpened"
         :project-id="projectId"
         :start-command="project.startCommand"
         :default-start-command="defaultStartCommand"
         :resettable="project.source === 'template'"
         @saved="project.startCommand = $event" />
      <input
         ref="upload-input"
         type="file"
         multiple
         class="hidden"
         @change="onUploadInputChange" />
      <StSpace fill>
         <EditorBoardLayout preview-label="实时预览">
            <template #board-files>
               <Teleport :disabled="!isMobile" to="#challenge-mobile-drawer-files">
                  <FileManagerPanel
                     v-model:selected-path="selectedPath"
                     uploadable
                     :upload-target-label="uploadTargetLabel"
                     :dir-loader="dirLoader"
                     :file-loader="fileLoader"
                     :fs-tree="fsTree"
                     @move-item="handleMoveItem"
                     @file-click="handleFileClick"
                     @add-file="handleAddFile"
                     @add-folder="handleAddFolder"
                     @upload="uploadFiles">
                     <template #footer>
                        <StSpace
                           fill-x
                           direction="vertical"
                           gap="0.5rem"
                           class="bg-accent-600/50 rounded-lg px-4 py-3 text-accent-400">
                           <StSpace fill-x align="center" gap="0.5rem" :title="syncState.text">
                              <component
                                 :is="syncState.Icon"
                                 :class="syncState.spinning ? 'animate-spin' : ''"
                                 class="shrink-0"
                                 :size="16"
                                 :stroke-width="3" />
                              <span class="text-xs truncate">{{ syncState.text }}</span>
                           </StSpace>
                           <div
                              class="w-full h-1 rounded-full bg-accent-500 overflow-hidden"
                              role="progressbar"
                              :aria-valuenow="Math.round(usagePercent)"
                              aria-valuemin="0"
                              aria-valuemax="100"
                              aria-label="项目空间占用">
                              <div
                                 class="h-full rounded-full transition-all"
                                 :class="usagePercent > 90 ? 'bg-error' : 'bg-primary'"
                                 :style="{ width: `${usagePercent}%` }" />
                           </div>
                           <span class="text-[0.6875rem] text-accent-400">
                              已用 {{ formatFileSize(projectSize) }} / {{ formatFileSize(limits.maxProjectBytes) }}
                           </span>
                        </StSpace>
                     </template>
                  </FileManagerPanel>
               </Teleport>
            </template>

            <template #board-code>
               <StSplitPanel
                  direction="vertical"
                  class="size-full"
                  storage-key="editor.code-terminal"
                  :hide-end="!editorStore.terminalVisible"
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
                  ref="preview"
                  :steps="steps"
                  :current-step="currentStep"
                  :single-step="project.source === 'github'"
                  :empty-hint="project.source === 'github' && projectFilesLoaded ? '启动服务以预览' : undefined"
                  :preview-url="previewUrl"
                  :servers="servers"
                  :unsupported-reason="unsupportedReason" />
            </template>
         </EditorBoardLayout>
      </StSpace>
   </StSpace>
</template>

<style src="@/assets/css/utils.css" />
