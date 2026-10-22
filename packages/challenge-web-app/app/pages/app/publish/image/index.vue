<script setup lang="ts">
import { Boxing } from '@icon-park/vue-next';
import { useWebContainer } from '~/pages/challenge/_composables/use-web-container';
import { useTerminal } from '~/pages/challenge/_composables/use-terminal';
import KvTextEditor from '~/pages/challenge/_subpages/editor/_modules/KvTextEditor.vue';

useSeoMeta({ title: '创建镜像 - Quanta Challenge' });

interface ImageBuildItem {
   id: string;
   name: string;
   status: string;
   compression: string;
   sizeBytes?: number | null;
   compressedSizeBytes?: number | null;
   createdAt: string | Date;
}

const DEFAULT_BUILD_FILE = `# 每行一条 shell 命令，在容器工作区内依次执行；工作区的最终内容就是镜像。
# 以 # 开头的行为注释；行首的 [标题] 前缀可选，只用于日志展示。
[npm-init] npm init -y >/dev/null
[install] npm i vite pnpm@9.15.9 --no-audit --no-fund
[rolldown] npm i @rolldown/binding-wasm32-wasi@1.2.15 --no-save --no-audit --no-fund
[verify] ./node_modules/.bin/vite --version`;

const { $trpc } = useNuxtApp();

const outerClass =
   'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';

const name = ref('');
const buildFile = ref(DEFAULT_BUILD_FILE);

const buildState = ref<'idle' | 'building' | 'built' | 'failed'>('idle');
const buildError = ref('');
const rawSize = ref(0);
const compressedSize = ref(0);
const uploadState = ref<'idle' | 'uploading' | 'uploaded'>('idle');
const uploadError = ref('');
const currentId = ref('');

type LogTerminal = ReturnType<typeof useTerminal>;
const logContainer = useTemplateRef<HTMLDivElement>('log-container');
let logTerminal: LogTerminal | null = null;

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
      new ResizeObserver(debouncedFit).observe(element);
      // CJK 字体通常晚于首次 fit 加载，字宽度量变化会让行高算错，字体就绪后再 fit 一次
      document.fonts?.ready.then(() => fitAddon.fit());
   });

   await instance.initializeTerminal();
   const { terminal } = await instance.getInstance();
   terminal.writeln('构建日志会输出到这里。');
});

const isoUnsupported = computed(() => {
   if (!import.meta.client) return '';
   return window.crossOriginIsolated
      ? ''
      : '页面未处于跨源隔离状态（crossOriginIsolated = false），WebContainer 无法启动。';
});

onMounted(() => {
   if (!import.meta.client) return;
   if (window.crossOriginIsolated) {
      sessionStorage.removeItem('wc-coi-reloaded');
      return;
   }
   if (!sessionStorage.getItem('wc-coi-reloaded')) {
      sessionStorage.setItem('wc-coi-reloaded', '1');
      window.location.reload();
   }
});

const fmtSize = (bytes?: number | null) => {
   if (!bytes && bytes !== 0) return '-';
   return bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
      : `${(bytes / 1024).toFixed(1)} KB`;
};

const { getInstance } = useWebContainer({ workdirName: 'image-build' });

/** WebContainer 的 output 流产出字符串，直接写入 xterm（保留 ANSI 颜色） */
const drainOutput = (process: { output: ReadableStream<string> }) => {
   void process.output.pipeTo(
      new WritableStream({
         write(chunk) {
            void getLogTerminal()
               .then(({ terminal }) => terminal.write(chunk))
               .catch(() => undefined);
         },
      }),
   );
};

/** export 的路径相对 workdir 解析；'.' 即整个工作区 */
const exportWorkdir = async (instance: Awaited<ReturnType<typeof getInstance>>) => {
   try {
      return await instance.export('.', { format: 'binary' });
   } catch {
      return await instance.export('/', { format: 'binary' });
   }
};

// 构建产物（未压缩的原始 snapshot）与 gzip 压缩产物；
// mount() 会转移（detach）传入的 buffer，这里只用于上传，不受影响
const rawBytes = ref<Uint8Array>(new Uint8Array(0));
const compressedBytes = ref<Uint8Array>(new Uint8Array(0));

const gzipCompress = async (bytes: Uint8Array) =>
   new Uint8Array(
      await new Response(
         new Blob([bytes as unknown as BlobPart])
            .stream()
            .pipeThrough(new CompressionStream('gzip')),
      ).arrayBuffer(),
   );

const handleBuild = async () => {
   buildState.value = 'building';
   buildError.value = '';
   const { terminal } = await getLogTerminal();
   terminal.reset();
   appendLog('[1/3] 正在启动开发容器…');
   try {
      const instance = await getInstance();

      appendLog('[2/3] 清理工作区并执行构建脚本…');
      // 防止同会话内重复构建时残留旧产物
      const clean = await instance.spawn('sh', [
         '-c',
         'rm -rf node_modules package.json package-lock.json .npmrc 2>/dev/null; true',
      ]);
      await clean.exit;

      const lines = buildFile.value
         .split('\n')
         .map((line) => line.trim())
         .filter((line) => line.length > 0 && !line.startsWith('#'));

      if (lines.length === 0) throw new Error('构建文件里没有可执行的命令');

      for (const [index, rawLine] of lines.entries()) {
         // 支持可选的 [标题] 前缀，与 bootCommand 的书写习惯一致
         const match = rawLine.match(/^\[(.+?)\]\s*(.+)$/);
         const title = match?.[1] ?? `step-${index + 1}`;
         const command = match?.[2] ?? rawLine;
         appendLog(`[${title}] $ ${command}`);

         const process = await instance.spawn('sh', ['-c', command]);
         void drainOutput(process);
         const code = await process.exit;
         if (code !== 0) {
            throw new Error(`命令「${title || command}」退出码 ${code}`);
         }
      }

      appendLog('[3/3] 导出镜像并压缩（gzip）…');
      const snapshot = await exportWorkdir(instance);
      rawBytes.value = snapshot;
      rawSize.value = snapshot.byteLength;
      const gz = await gzipCompress(snapshot);
      compressedBytes.value = gz;
      compressedSize.value = gz.byteLength;
      buildState.value = 'built';
      appendLog(
         `✓ 构建完成：原始 ${fmtSize(rawSize.value)}，gzip 压缩后 ${fmtSize(compressedSize.value)}`,
      );
   } catch (error) {
      buildState.value = 'failed';
      buildError.value = error instanceof Error ? error.message : String(error);
      appendLog(`✗ 构建失败：${buildError.value}`);
   }
};

// ---------- 保存与上传 ----------

const csrf = useCookie('quanta_csrf_token');

const handleUpload = async () => {
   uploadState.value = 'uploading';
   uploadError.value = '';
   try {
      if (!name.value.trim()) throw new Error('请先填写镜像名称');
      if (buildState.value !== 'built') throw new Error('请先完成构建');

      // 编辑已有记录则复用，否则创建
      if (!currentId.value) {
         const created = await $trpc.admin.imageBuild.create.mutate({
            name: name.value.trim(),
            buildFile: buildFile.value,
         });
         currentId.value = created.id;
      } else {
         await $trpc.admin.imageBuild.update.mutate({
            id: currentId.value,
            name: name.value.trim(),
            buildFile: buildFile.value,
         });
      }

      // 上传的是客户端压缩好的 gzip 产物
      const resp = await fetch(`/api/image-builds/upload?id=${currentId.value}`, {
         method: 'PUT',
         headers: {
            'content-type': 'application/octet-stream',
            'x-csrf-token': csrf.value ?? '',
         },
         body: compressedBytes.value as unknown as BlobPart,
      });
      if (!resp.ok) {
         throw new Error(`上传失败（HTTP ${resp.status}）：${await resp.text()}`);
      }
      const result = (await resp.json()) as { sizeBytes: number; compressedSizeBytes: number };
      rawSize.value = result.sizeBytes;
      compressedSize.value = result.compressedSizeBytes;
      uploadState.value = 'uploaded';
      await refreshList();
   } catch (error) {
      uploadState.value = 'idle';
      uploadError.value = error instanceof Error ? error.message : String(error);
   }
};

// ---------- 已有镜像列表 ----------

const builds = ref<ImageBuildItem[]>([]);
const listLoading = ref(false);
const refreshList = async () => {
   listLoading.value = true;
   try {
      builds.value = await $trpc.admin.imageBuild.list.query();
   } finally {
      listLoading.value = false;
   }
};
onMounted(() => refreshList());

const handleRemove = async (item: ImageBuildItem) => {
   if (!confirm(`确定删除镜像「${item.name}」？`)) return;
   await $trpc.admin.imageBuild.remove.mutate({ id: item.id });
   if (currentId.value === item.id) {
      currentId.value = '';
      uploadState.value = 'idle';
   }
   await refreshList();
};

const editBuild = (item: ImageBuildItem) => {
   // 只回填名称与构建文件，产物需要重新构建上传
   name.value = item.name;
   currentId.value = '';
   uploadState.value = 'idle';
   buildState.value = 'idle';
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-[56rem] pb-[10rem] my-6">
         <h1 class="st-font-hero-bold">创建镜像</h1>

         <div
            v-if="isoUnsupported"
            class="p-4 border border-error rounded-lg text-error st-font-body-normal">
            {{ isoUnsupported }}
         </div>

         <StSpace direction="vertical" gap="0.75rem" fill-x>
            <StFormItem name="name" label="镜像名称" required>
               <StInput
                  v-model:value="name"
                  placeholder="例如：node24-vite-pnpm"
                  :outer-class />
            </StFormItem>
            <StFormItem name="buildFile" label="构建文件">
               <div
                  class="h-80 border border-accent-600 rounded-lg overflow-hidden relative bg-simple-editor-background">
                  <KvTextEditor v-model="buildFile" language="shell" wrap />
               </div>
               <p class="st-font-caption text-accent-300 mt-1">
                  类似 Dockerfile：每行一条 shell 命令，在容器工作区内依次执行；工作区最终内容即为镜像。
               </p>
            </StFormItem>
         </StSpace>

         <StSpace gap="0.75rem" align="center">
            <StButton
               :loading="buildState === 'building'"
               :disabled="!!isoUnsupported"
               class="py-[0.5rem] px-[1.375rem] text-accent-100 !rounded-[0.625rem]"
               @click="handleBuild">
               <div class="flex items-center gap-2">
                  <Boxing size="1.1rem" :fill="'currentColor'" />
                  <span>{{ buildState === 'building' ? '构建中…' : '构建镜像' }}</span>
               </div>
            </StButton>
         </StSpace>

         <div
            v-if="buildError"
            class="p-4 border border-error rounded-lg text-error st-font-body-normal">
            {{ buildError }}
         </div>

         <div
            class="w-full min-w-0 h-64 bg-[#1C1C1C] border border-accent-600 rounded-lg overflow-hidden p-3"
         >
            <div ref="log-container" class="h-full w-full overflow-hidden" />
         </div>

         <div v-if="buildState === 'built'" class="space-y-3">
            <StSpace
               fill-x
               justify="between"
               align="center"
               class="p-4 border border-accent-600 rounded-lg">
               <StSpace direction="vertical" gap="0.25rem">
                  <span class="st-font-body-bold">
                     原始大小：{{ fmtSize(rawSize) }}
                  </span>
                  <span class="st-font-body-normal text-accent-300">
                     gzip 压缩后：{{ uploadState === 'uploaded' ? fmtSize(compressedSize) : '上传后由服务端计算' }}
                  </span>
               </StSpace>
               <StButton
                  :loading="uploadState === 'uploading'"
                  class="py-[0.5rem] px-[1.375rem] text-accent-100 !rounded-[0.625rem]"
                  @click="handleUpload">
                  <div class="flex items-center gap-2">
                     <span>{{ uploadState === 'uploaded' ? '已上传，重新上传' : '上传到服务器' }}</span>
                  </div>
               </StButton>
            </StSpace>
            <p v-if="uploadError" class="text-error st-font-body-normal">{{ uploadError }}</p>
            <p v-if="uploadState === 'uploaded'" class="text-success st-font-body-normal">
               ✓ 已上传（id: {{ currentId }}）。在「发布题目」的初始镜像下拉里即可选择
               custom:{{ currentId }}。
            </p>
         </div>

         <StSpace direction="vertical" gap="0.75rem" fill-x>
            <StSpace justify="between" align="center" fill-x>
               <h2 class="st-font-secondary-bold">已有镜像</h2>
               <StTextButton text="刷新" @click="refreshList" />
            </StSpace>
            <StScrollable fill scroll class="max-h-72">
               <StSpace direction="vertical" gap="0.5rem" fill-x>
                  <div
                     v-for="item in builds"
                     :key="item.id"
                     class="p-3 border border-accent-600 rounded-lg flex items-center justify-between gap-4">
                     <StSpace direction="vertical" gap="0.25rem">
                        <span class="st-font-body-bold">
                           {{ item.name }}
                           <span
                              class="ml-2 st-font-caption"
                              :class="item.status === 'ready' ? 'text-success' : 'text-accent-300'">
                              {{ item.status === 'ready' ? '可用' : item.status }}
                           </span>
                        </span>
                        <span class="st-font-caption text-accent-300">
                          custom:{{ item.id }} · gzip 压缩 ·
                          原始 {{ fmtSize(item.sizeBytes) }} / 压缩后 {{ fmtSize(item.compressedSizeBytes) }}
                        </span>
                     </StSpace>
                     <StSpace gap="0.5rem">
                        <StTextButton text="复用配置" @click="editBuild(item)" />
                        <StTextButton text="删除" @click="handleRemove(item)" />
                     </StSpace>
                  </div>
                  <p v-if="!builds.length" class="st-font-body-normal text-accent-300">
                    还没有镜像，构建并上传一个吧。
                  </p>
               </StSpace>
            </StScrollable>
         </StSpace>
      </StSpace>
   </StSpace>
</template>
