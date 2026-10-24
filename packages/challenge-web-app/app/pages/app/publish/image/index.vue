<script setup lang="ts">
import { CloseOne, PlayOne, UploadTwo } from '@icon-park/vue-next';
import type { WebContainerProcess } from '@webcontainer/api';
import type { StepsStep, StepsTone } from '~/components/st/Steps/type';
import { useWebContainer } from '~/pages/challenge/_composables/use-web-container';
import { useTerminal } from '~/pages/challenge/_composables/use-terminal';
import { useMessage } from '~/components/st/Message/use-message';
import { dialog } from '~/composables/use-dialog';
import KvTextEditor from '~/pages/challenge/_subpages/editor/_modules/KvTextEditor.vue';

const WORKDIR_NAME = 'image-build';
// 压缩后体积上限，超过则中止上传
const MAX_COMPRESSED_BYTES = useRuntimeConfig().public.imageBuild.maxCompressedBytes;

const DEFAULT_BUILD_FILE = [
   '# 每行一条 shell 命令，在容器工作区内依次执行；工作区的最终内容就是快照镜像。',
   '# 以 # 开头的行为注释；行首的 [标题] 前缀可选，只用于日志展示。',
   '[npm-init] npm init -y >/dev/null',
   '[install] npm i vite pnpm@9.15.9 --no-audit --no-fund',
   '[rolldown] npm i @rolldown/binding-wasm32-wasi@1.2.15 --no-save --no-audit --no-fund',
   '[verify] ./node_modules/.bin/vite --version',
].join('\n');

const { $trpc, $authFetch } = useNuxtApp();
const message = useMessage();
const route = useRoute();
const router = useRouter();

// ---------- 表单 ----------

const name = ref('');
const description = ref('');
const buildFile = ref(DEFAULT_BUILD_FILE);

/** 当前编辑的快照镜像 id */
const currentId = ref(typeof route.query.id === 'string' ? route.query.id : '');
const isEditMode = computed(() => !!currentId.value);
const editingReferenceCount = ref(0);
const detailLoading = ref(false);

useSeoMeta({
   title: () => `${isEditMode.value ? '编辑快照镜像' : '构建快照镜像'} - Quanta Challenge`,
});

const outerClass =
   'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';

const loadDetail = async () => {
   if (!currentId.value) return;
   detailLoading.value = true;
   try {
      const detail = await $trpc.admin.imageBuild.detail.query({ id: currentId.value });
      name.value = detail.name;
      description.value = detail.description;
      buildFile.value = detail.buildFile;
      editingReferenceCount.value = detail.references.length;
   } catch (error) {
      message.error('加载快照镜像失败', toErrorMessage(error));
      currentId.value = '';
      await router.replace({ query: {} });
   } finally {
      detailLoading.value = false;
   }
};
onMounted(loadDetail);

// ---------- 构建状态 ----------

type Phase =
   | 'idle'
   | 'booting'
   | 'running'
   | 'exporting'
   | 'compressing'
   | 'built'
   | 'publishing'
   | 'published'
   | 'failed'
   | 'cancelled';

const phase = ref<Phase>('idle');
/** 失败或取消时所处的阶段 */
const failedAt = ref<Phase | null>(null);
const buildError = ref('');
const publishError = ref('');

const stepTotal = ref(0);
const stepIndex = ref(0);
const stepTitle = ref('');
const compressProgress = ref(0);
const rawSize = ref(0);
const compressedSize = ref(0);
const elapsedMs = ref(0);

// 产物与生成它的构建文件一起发布
const compressedBytes = shallowRef<Uint8Array | null>(null);
const builtFrom = ref('');

const isBuilding = computed(() =>
   ['booting', 'running', 'exporting', 'compressing'].includes(phase.value),
);
const isPublishing = computed(() => phase.value === 'publishing');
const isBusy = computed(() => isBuilding.value || isPublishing.value);
const hasUnpublishedArtifact = computed(() => phase.value === 'built');
const isArtifactStale = computed(
   () =>
      !!compressedBytes.value &&
      (phase.value === 'built' || phase.value === 'published') &&
      buildFile.value !== builtFrom.value,
);

const PHASE_ORDER: Phase[] = ['booting', 'running', 'exporting', 'compressing', 'publishing'];
const STEP_TITLES = ['启动容器', '执行构建脚本', '导出快照', 'gzip 压缩', '发布'];

const progressSteps = computed<StepsStep[]>(() => {
   const current =
      phase.value === 'built'
         ? 4
         : phase.value === 'published'
           ? 5
           : PHASE_ORDER.indexOf(
                failedAt.value && ['failed', 'cancelled'].includes(phase.value)
                   ? failedAt.value
                   : phase.value,
             );
   return STEP_TITLES.map((title, index) => {
      let status: StepsStep['status'] = 'waiting';
      if (current < 0) status = 'waiting';
      else if (index < current) status = 'completed';
      else if (index === current) {
         status = ['failed', 'cancelled'].includes(phase.value)
            ? 'error'
            : phase.value === 'built'
              ? 'waiting'
              : 'inProgress';
      }
      return { title, status };
   });
});

const statusText = computed(() => {
   switch (phase.value) {
      case 'booting':
         return '正在启动开发容器…';
      case 'running':
         return `正在执行第 ${stepIndex.value}/${stepTotal.value} 步：${stepTitle.value}`;
      case 'exporting':
         return '正在导出工作区快照…';
      case 'compressing':
         return `正在 gzip 压缩… ${Math.floor(compressProgress.value * 100)}%`;
      case 'built':
         return '构建完成，确认无误后发布快照镜像';
      case 'publishing':
         return '正在上传并发布快照镜像…';
      case 'published':
         return '快照镜像已发布';
      case 'failed':
         return '构建失败';
      case 'cancelled':
         return '构建已取消';
      default:
         return '填写构建文件后开始构建';
   }
});

const statusTone = computed<StepsTone>(() => {
   if (phase.value === 'failed') return 'error';
   if (phase.value === 'cancelled') return 'warning';
   if (phase.value === 'built' || phase.value === 'published') return 'success';
   return isBusy.value ? 'active' : 'idle';
});

const toErrorMessage = (error: unknown) =>
   error instanceof Error ? error.message : String(error);

const fmtSize = (bytes?: number | null) => {
   if (!bytes && bytes !== 0) return '-';
   return bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
      : `${(bytes / 1024).toFixed(1)} KB`;
};
const fmtDuration = (ms: number) => {
   const seconds = Math.floor(ms / 1000);
   return seconds >= 60
      ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
      : `${seconds} 秒`;
};
const compressionRatio = computed(() =>
   rawSize.value ? `${((compressedSize.value / rawSize.value) * 100).toFixed(1)}%` : '-',
);

const hasArtifact = computed(
   () =>
      !!compressedBytes.value &&
      ['built', 'publishing', 'published'].includes(phase.value),
);
const footerText = computed(() => {
   if (phase.value === 'published') return '已发布';
   if (hasArtifact.value) {
      return `原始 ${fmtSize(rawSize.value)} · 压缩后 ${fmtSize(compressedSize.value)}（${compressionRatio.value}）`;
   }
   return '构建完成后即可发布';
});

let elapsedTimer: ReturnType<typeof setInterval> | null = null;
const startElapsed = () => {
   const startedAt = Date.now();
   elapsedMs.value = 0;
   elapsedTimer = setInterval(() => {
      elapsedMs.value = Date.now() - startedAt;
   }, 500);
};
const stopElapsed = () => {
   if (elapsedTimer) clearInterval(elapsedTimer);
   elapsedTimer = null;
};
onBeforeUnmount(stopElapsed);

// ---------- 构建日志终端 ----------

type LogTerminal = ReturnType<typeof useTerminal>;
const logContainer = useTemplateRef<HTMLDivElement>('log-container');
let logTerminal: LogTerminal | null = null;
let logResizeObserver: ResizeObserver | null = null;
onBeforeUnmount(() => logResizeObserver?.disconnect());

const getLogTerminal = () => {
   if (!logTerminal) throw new Error('构建日志终端尚未初始化');
   return logTerminal.getInstance();
};

const appendLog = async (line: string) => {
   const { terminal } = await getLogTerminal();
   terminal.writeln(line);
};

onMounted(async () => {
   await nextTick();
   await new Promise((resolve) => requestAnimationFrame(resolve));
   const element = logContainer.value;
   if (!element) return;

   const instance = useTerminal({
      containerKey: 'build-log-terminal',
      containerElement: element,
      theme: { background: '#1C1C1C' },
   });
   logTerminal = instance;

   instance.onTerminalReady((_, fitAddon) => {
      const debouncedFit = useDebounceFn(() => fitAddon.fit(), 200);
      logResizeObserver = new ResizeObserver(debouncedFit);
      logResizeObserver.observe(element);
      // 字体就绪后字宽会变化，需要重新 fit
      document.fonts?.ready.then(() => fitAddon.fit());
   });

   await instance.initializeTerminal();
   const { terminal } = await instance.getInstance();
   terminal.writeln('\x1b[90m构建日志会输出到这里。\x1b[0m');
});

// ---------- 跨源隔离 ----------

const isoUnsupported = computed(() => {
   if (!import.meta.client) return '';
   return window.crossOriginIsolated
      ? ''
      : '页面未处于跨源隔离状态（crossOriginIsolated = false），WebContainer 无法启动。';
});

onMounted(() => {
   if (window.crossOriginIsolated) {
      sessionStorage.removeItem('wc-coi-reloaded');
      return;
   }
   if (!sessionStorage.getItem('wc-coi-reloaded')) {
      sessionStorage.setItem('wc-coi-reloaded', '1');
      window.location.reload();
   }
});

// ---------- 离开拦截 ----------

/** 已在应用内确认离开时跳过 beforeunload 提示 */
let leaveConfirmed = false;

const preventUnload = (event: BeforeUnloadEvent) => {
   if (leaveConfirmed || (!isBusy.value && !hasUnpublishedArtifact.value)) return;
   event.preventDefault();
   event.returnValue = '';
};
onMounted(() => window.addEventListener('beforeunload', preventUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', preventUnload));

// WebContainer 是标签页级单例且 workdir 在 boot 时固定，离开本页需整页跳转
onBeforeRouteLeave(async (to) => {
   if (isBusy.value || hasUnpublishedArtifact.value) {
      const confirmed = await dialog.confirm({
         title: isBusy.value ? '快照镜像正在构建' : '快照镜像尚未发布',
         description: isBusy.value
            ? '离开页面会中断当前的构建或上传，已完成的进度不会保留。确定要离开吗？'
            : '构建产物还没有发布，离开后需要重新构建。确定要离开吗？',
         variant: 'danger',
         confirmText: '离开',
         cancelText: '留在此页',
      });
      if (!confirmed) return false;
      cancelBuild();
   }
   leaveConfirmed = true;
   window.location.assign(router.resolve(to.fullPath).href);
   return false;
});

// ---------- 构建 ----------

class BuildCancelledError extends Error {
   constructor() {
      super('构建已取消');
   }
}

let cancelRequested = false;
let currentProcess: WebContainerProcess | null = null;
/** 取消时 resolve；kill() 不保证所有等待都会结束 */
let notifyCancelled: (() => void) | null = null;
let cancelledSignal: Promise<void> = Promise.resolve();

const resetCancellation = () => {
   cancelRequested = false;
   cancelledSignal = new Promise<void>((resolve) => {
      notifyCancelled = resolve;
   });
};

const throwIfCancelled = () => {
   if (cancelRequested) throw new BuildCancelledError();
};

const cancelBuild = () => {
   if (!isBuilding.value) return;
   cancelRequested = true;
   notifyCancelled?.();
   try {
      currentProcess?.kill();
   } catch {
      // 进程可能已经结束
   }
};

const { getInstance } = useWebContainer({ workdirName: WORKDIR_NAME });

const getBuildInstance = async () => {
   const instance = await getInstance();
   if (!instance.workdir.endsWith(`/${WORKDIR_NAME}`)) {
      throw new Error(
         `当前标签页的开发容器工作区是 ${instance.workdir}，不是快照镜像构建专用工作区，请刷新页面后重试`,
      );
   }
   return instance;
};

const drainOutput = (process: WebContainerProcess) => {
   void process.output
      .pipeTo(
         new WritableStream({
            write(chunk) {
               void getLogTerminal()
                  .then(({ terminal }) => terminal.write(chunk))
                  .catch(() => undefined);
            },
         }),
      )
      .catch(() => undefined);
};

/** 清空工作区（含隐藏文件） */
const cleanWorkdir = async (
   instance: Awaited<ReturnType<typeof getBuildInstance>>,
) => {
   const entries = await instance.fs.readdir('.');
   await Promise.all(
      entries.map((entry) => instance.fs.rm(entry, { recursive: true, force: true })),
   );
};

/** 流式 gzip，按输入字节汇报进度，分块之间可取消 */
const gzipCompress = async (
   bytes: Uint8Array,
   onProgress: (ratio: number) => void,
) => {
   let consumed = 0;
   const counter = new TransformStream<
      Uint8Array<ArrayBuffer>,
      Uint8Array<ArrayBuffer>
   >({
      transform(chunk, controller) {
         consumed += chunk.byteLength;
         onProgress(consumed / bytes.byteLength);
         controller.enqueue(chunk);
      },
   });
   const reader = new Blob([bytes as unknown as BlobPart])
      .stream()
      .pipeThrough(counter)
      .pipeThrough(new CompressionStream('gzip'))
      .getReader();

   const chunks: Uint8Array[] = [];
   let total = 0;
   while (true) {
      if (cancelRequested) {
         await reader.cancel().catch(() => undefined);
         throw new BuildCancelledError();
      }
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
   }
   const merged = new Uint8Array(total);
   let offset = 0;
   for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
   }
   return merged;
};

const parseBuildFile = (content: string) =>
   content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line, index) => {
         // 可选的 [标题] 前缀
         const match = line.match(/^\[(.+?)\]\s*(.+)$/);
         return {
            title: match?.[1] ?? `step-${index + 1}`,
            command: match?.[2] ?? line,
         };
      });

const handleBuild = async () => {
   if (isBusy.value) return;
   const source = buildFile.value;
   const steps = parseBuildFile(source);
   if (steps.length === 0) {
      buildError.value = '构建文件里没有可执行的命令';
      phase.value = 'failed';
      failedAt.value = 'running';
      return;
   }

   resetCancellation();
   buildError.value = '';
   publishError.value = '';
   failedAt.value = null;
   compressedBytes.value = null;
   compressProgress.value = 0;
   stepTotal.value = steps.length;
   stepIndex.value = 0;
   startElapsed();

   try {
      const { terminal } = await getLogTerminal();
      terminal.reset();

      phase.value = 'booting';
      appendLog('\x1b[36m▶ 启动开发容器\x1b[0m');
      const instance = await Promise.race([getBuildInstance(), cancelledSignal]);
      throwIfCancelled();
      if (!instance) throw new BuildCancelledError();
      await cleanWorkdir(instance);
      throwIfCancelled();

      phase.value = 'running';
      for (const [index, { title, command }] of steps.entries()) {
         stepIndex.value = index + 1;
         stepTitle.value = title;
         appendLog(`\x1b[36m▶ [${index + 1}/${steps.length}] ${title}\x1b[0m $ ${command}`);
         currentProcess = await instance.spawn('sh', ['-c', command]);
         drainOutput(currentProcess);
         const code = await Promise.race([currentProcess.exit, cancelledSignal]);
         currentProcess = null;
         throwIfCancelled();
         if (code !== 0) {
            throw new Error(`第 ${index + 1} 步「${title}」退出码 ${code}`);
         }
      }

      phase.value = 'exporting';
      appendLog('\x1b[36m▶ 导出工作区快照\x1b[0m');
      const snapshot = await Promise.race([
         instance.export('.', { format: 'binary' }),
         cancelledSignal,
      ]);
      throwIfCancelled();
      if (!snapshot || snapshot.byteLength === 0) throw new Error('导出的快照镜像为空');
      rawSize.value = snapshot.byteLength;

      // 构建结束即自动压缩，发布时直接上传压缩产物
      phase.value = 'compressing';
      appendLog(`\x1b[36m▶ gzip 压缩\x1b[0m（原始 ${fmtSize(snapshot.byteLength)}）`);
      const gz = await gzipCompress(snapshot, (ratio) => {
         compressProgress.value = ratio;
      });
      if (gz.byteLength > MAX_COMPRESSED_BYTES) {
         throw new Error(
            `快照镜像压缩后 ${fmtSize(gz.byteLength)}，超过上限 ${fmtSize(MAX_COMPRESSED_BYTES)}，请精简依赖`,
         );
      }

      compressedSize.value = gz.byteLength;
      compressedBytes.value = gz;
      builtFrom.value = source;
      phase.value = 'built';
      appendLog(
         `\x1b[32m✓ 构建完成\x1b[0m：原始 ${fmtSize(rawSize.value)}，压缩后 ${fmtSize(gz.byteLength)}，用时 ${fmtDuration(elapsedMs.value)}`,
      );
   } catch (error) {
      failedAt.value = phase.value;
      currentProcess = null;
      if (error instanceof BuildCancelledError) {
         phase.value = 'cancelled';
         appendLog('\x1b[33m■ 构建已取消\x1b[0m').catch(() => undefined);
      } else {
         phase.value = 'failed';
         buildError.value = toErrorMessage(error);
         appendLog(`\x1b[31m✗ 构建失败：${buildError.value}\x1b[0m`).catch(() => undefined);
      }
   } finally {
      stopElapsed();
   }
};

// ---------- 发布 ----------

const savingMeta = ref(false);
/** 仅更新名称与备注 */
const handleSaveMeta = async () => {
   if (!currentId.value || savingMeta.value) return;
   const trimmedName = name.value.trim();
   if (!trimmedName) {
      message.error('请先填写快照镜像名称');
      return;
   }
   savingMeta.value = true;
   try {
      await $trpc.admin.imageBuild.update.mutate({
         id: currentId.value,
         name: trimmedName,
         description: description.value.trim(),
      });
      message.success('已保存');
   } catch (error) {
      message.error('保存失败', toErrorMessage(error));
   } finally {
      savingMeta.value = false;
   }
};

const uploadArtifact = async (id: string, bytes: Uint8Array) => {
   const resp = await $authFetch(`/api/image-builds/upload?id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes as unknown as BodyInit,
   });
   if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new Error(`上传失败（HTTP ${resp.status}）${detail ? `：${detail}` : ''}`);
   }
   return (await resp.json()) as { sizeBytes: number; compressedSizeBytes: number };
};

const handlePublish = async () => {
   if (isBusy.value) return;
   publishError.value = '';
   const trimmedName = name.value.trim();
   const bytes = compressedBytes.value;
   if (!trimmedName) {
      publishError.value = '请先填写快照镜像名称';
      return;
   }
   if (!bytes) {
      publishError.value = '请先完成构建';
      return;
   }
   if (isArtifactStale.value) {
      publishError.value = '构建文件在构建后被修改过，请重新构建后再发布';
      return;
   }

   const previousPhase = phase.value;
   phase.value = 'publishing';
   try {
      const meta = {
         name: trimmedName,
         description: description.value.trim(),
         buildFile: builtFrom.value,
      };
      if (currentId.value) {
         // 先替换产物再更新元数据，上传失败时旧产物仍可用
         await uploadArtifact(currentId.value, bytes);
         await $trpc.admin.imageBuild.update.mutate({ id: currentId.value, ...meta });
      } else {
         const created = await $trpc.admin.imageBuild.create.mutate(meta);
         try {
            await uploadArtifact(created.id, bytes);
         } catch (error) {
            // 新记录没有可用产物，上传失败时删除
            await $trpc.admin.imageBuild.remove
               .mutate({ id: created.id })
               .catch(() => undefined);
            throw error;
         }
         currentId.value = created.id;
         await router.replace({ query: { id: created.id } });
      }
      phase.value = 'published';
      message.success(
         '快照镜像已发布',
         editingReferenceCount.value
            ? `${editingReferenceCount.value} 道使用该快照镜像的题目将直接使用新版本`
            : '可在发布题目时的「快照镜像」中选择',
      );
   } catch (error) {
      phase.value = previousPhase;
      publishError.value = toErrorMessage(error);
   }
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace direction="vertical" gap="1.5rem" class="w-[44rem] pb-[10rem] my-6">
         <StSpace align="end" gap="1rem">
            <h1 class="st-font-hero-bold">{{ isEditMode ? '编辑快照镜像' : '构建快照镜像' }}</h1>
            <span
               v-if="isEditMode"
               class="st-font-caption font-mono text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full">
               {{ currentId }}
            </span>
         </StSpace>

         <StBanner v-if="isoUnsupported" type="error">
            {{ isoUnsupported }}
         </StBanner>
         <StBanner v-if="isEditMode && editingReferenceCount > 0" type="info">
            该快照镜像正被 {{ editingReferenceCount }} 道题目使用
            <template #description>重新发布后，这些题目会直接使用新版本。</template>
         </StBanner>

         <div class="w-full">
            <StSpace direction="vertical" gap="1.75rem" class="w-full px-[0.625rem]">
               <StFormItem name="name" label="快照镜像名称" required>
                  <StInput
                     v-model:value="name"
                     :disabled="detailLoading || isBusy"
                     placeholder="例如：node24-vite-pnpm"
                     :outer-class />
               </StFormItem>
               <StFormItem name="description" label="备注">
                  <StTextarea
                     v-model:value="description"
                     :disabled="detailLoading || isBusy"
                     rows="3"
                     maxlength="500"
                     placeholder="说明快照镜像用途、预装了哪些依赖、本次变更内容等，方便其他发布者选择"
                     :outer-class />
               </StFormItem>
               <StFormItem name="buildFile" label="构建文件" required>
                  <template #header-right>
                     <span class="st-font-caption text-accent-300">
                        每行一条 shell 命令，可选 [标题] 前缀，# 开头为注释
                     </span>
                  </template>
                  <div class="p-[0.375rem] border border-accent-300 rounded-lg">
                     <div
                        class="h-80 rounded-[0.25rem] overflow-hidden relative bg-simple-editor-background"
                        :class="{ 'pointer-events-none opacity-60': isBusy }">
                        <KvTextEditor v-model="buildFile" language="shell" wrap />
                     </div>
                  </div>
               </StFormItem>

               <StFormItem name="build" label="构建">
                  <div
                     class="p-[0.375rem] pb-4 border border-accent-300 rounded-lg flex flex-col items-center gap-3">
                     <div class="w-full px-3 pt-3">
                        <StSteps
                           :steps="progressSteps"
                           :status="statusText"
                           :tone="statusTone"
                           :extra="elapsedMs ? `用时 ${fmtDuration(elapsedMs)}` : ''"
                           :percent="phase === 'compressing' ? compressProgress : null" />
                     </div>
                     <div
                        class="w-full min-w-0 h-72 rounded-[0.25rem] bg-[#1C1C1C] overflow-hidden p-3">
                        <div ref="log-container" class="h-full w-full overflow-hidden" />
                     </div>
                     <div
                        v-if="isBuilding"
                        class="flex gap-2 text-accent-100 font-bold items-center hover:text-error transition-colors hover:cursor-pointer"
                        @click="cancelBuild">
                        <CloseOne class="text-[1.25rem]" />
                        取消构建
                     </div>
                     <div
                        v-else
                        class="flex gap-2 font-bold items-center transition-colors"
                        :class="
                           isoUnsupported || isBusy || detailLoading
                              ? 'text-accent-400 cursor-not-allowed'
                              : 'text-accent-100 hover:text-primary hover:cursor-pointer'
                        "
                        @click="!isoUnsupported && !isBusy && !detailLoading && handleBuild()">
                        <PlayOne class="text-[1.25rem]" />
                        {{ phase === 'idle' ? '开始构建' : '重新构建' }}
                     </div>
                  </div>
                  <StBanner v-if="isBusy" type="warning">
                     {{ isPublishing ? '正在上传快照镜像' : '快照镜像构建中' }}，请不要关闭或刷新此页面
                     <template #description>
                        离开页面会中断{{ isPublishing ? '上传' : '构建' }}，已完成的进度不会保留。
                     </template>
                  </StBanner>
               </StFormItem>
            </StSpace>

            <StSpace direction="vertical" gap="0.75rem" class="px-2 mt-[2.13rem]">
               <StBanner v-if="buildError" type="error">
                  构建失败
                  <template #description>{{ buildError }}</template>
               </StBanner>
               <StBanner v-if="isArtifactStale" type="warning">
                  构建文件在构建后被修改过
                  <template #description>请重新构建后再发布，避免记录与产物不一致。</template>
               </StBanner>
               <StBanner v-if="publishError" type="error">
                  发布失败
                  <template #description>{{ publishError }}</template>
               </StBanner>
               <StBanner v-if="phase === 'published'" type="success">
                  快照镜像已发布
                  <template #description>在「发布题目」的「快照镜像」下拉里即可选择，前端题与后端题均可使用；它只作用于做题页环境，不影响判题。</template>
               </StBanner>
            </StSpace>

            <StSpace justify="between" align="center" gap="1rem" class="px-2 mt-4">
               <div class="flex-1 min-w-0 truncate text-accent-300" :title="footerText">
                  {{ footerText }}
               </div>
               <StSpace align="center" gap="0.75rem" class="shrink-0 whitespace-nowrap">
                  <StButton
                     v-if="isEditMode"
                     bordered
                     theme="secondary"
                     :loading="savingMeta"
                     :disabled="detailLoading || isBusy"
                     class="py-[0.375rem] px-[1.25rem] !rounded-[0.375rem]"
                     @click="handleSaveMeta">
                     仅保存信息
                  </StButton>
                  <StButton
                     :loading="isPublishing"
                     :disabled="!hasArtifact || isArtifactStale || phase === 'published'"
                     class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]"
                     @click="handlePublish">
                     <div class="flex gap-2 items-center">
                        <UploadTwo class="text-[1.5rem]" />
                        <span>{{ isEditMode ? '发布新版本' : '发布快照镜像' }}</span>
                     </div>
                  </StButton>
               </StSpace>
            </StSpace>
         </div>
      </StSpace>
   </StSpace>
</template>
