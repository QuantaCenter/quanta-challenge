<script setup lang="ts">
import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import type { IProgressStep } from '~/components/st/Progress/type';
import { useTerminal } from '../../../_composables/use-terminal';
import { useEventEmitter } from '~/composables/use-event-emitter';
import { acceptedBinaryExtensions } from '~/configs/accepted-pack-extension';

const props = defineProps<{
   getWcInstance: () => Promise<WebContainer>;
   runCommands: (command: string) => Promise<WebContainerProcess>;
   problemId: number;
   buildCommand?: string;
   uploadDir?: string;
}>();

/**
 * 把 WebContainer 内的路径转换成提交快照的键（以 `/` 开头的绝对路径）。
 *
 * 必须保留 `project/` 这一级：
 *   · 调度器把快照原样还原到 live-server 容器的 /app 下；
 *   · live-server 镜像与题目的 `initCommand`（`npx -y serve@14.2.6 -l 3000 project`，
 *     锁版本 + 免交互写法；见 docs/PROBLEM_AUTHORING.md 坑 11：**不要加 `--no-clipboard`**，
 *     加了 WebContainer 会起不来）
 *     都以 `project` 子目录为站点根（见 packages/challenge-agents/live-server/Dockerfile）。
 *
 * 原实现用 `path.slice(distDir.length)` 把 `project/` 前缀削掉，只有当用户的代码被
 * 错误地多挂了一层 `project/` 时才恰好还原成 `/project/...`；编辑器修好重复目录后，
 * 快照会变成 `/index.html`，live-server 在 project 下找不到页面，判题脚本一直等待
 * 选择器直到 20s 超时。这里改为始终保留完整路径。
 */
const toSnapshotPath = (path: string) =>
   '/' + path.split('/').filter((s) => s && s !== '.').join('/');

const opened = defineModel<boolean>('opened');

const steps = ref<IProgressStep[]>([]);
const initSteps = () => {
   steps.value = [
      { title: '构建', status: 'inProgress' },
      { title: '快照', status: 'waiting' },
      { title: '上传', status: 'waiting' },
   ];
};

const editorStore = useEditorStore();
const { containerKey, attachProcess, onTerminalReady } = useTerminal();
const { event } = useEventEmitter('challenge-layout', 'commit');
const isCommitting = ref(false);
const currentStep = ref(0);
watch(event, async () => {
   if (!editorStore.hasProjectInitialized) {
      // 原先这里直接 return，用户看不到任何反馈。现在说明原因。
      console.warn(
         '[challenge] 提交被阻止：',
         editorStore.commitBlockedReason ?? '在线开发容器尚未就绪',
      );
      return;
   }
   opened.value = true;

   if (isCommitting.value || !props.buildCommand || !props.uploadDir) return;
   isCommitting.value = true;

   initSteps();
   onTerminalReady(async (terminal, fitAddon) => {
      terminal.clear();
      nextTick(() => fitAddon.fit());
      try {
         await runBuildStep();
         const pack = await runPackStep(props.uploadDir!);
         const recordId = await runUploadStep(pack);
         close(recordId);
      } catch (e) {
         console.error(e);
         steps.value.find((step) => step.status === 'inProgress')!.status =
            'error';
      } finally {
         isCommitting.value = false;
      }
   });
});

let runningProcess: WebContainerProcess | null = null;
const runBuildStep = async () => {
   runningProcess = await props.runCommands(props.buildCommand!);
   await attachProcess(runningProcess);

   const code = await runningProcess.exit;
   runningProcess = null;
   if (code !== 0) {
      throw new Error('Failed to build');
   }

   steps.value[0]!.status = 'completed';
   steps.value[1]!.status = 'inProgress';
};

const runPackStep = async (distDir: string) => {
   const instance = await props.getWcInstance();
   // pack 'dist' dir
   const traverse = async (
      dirPath: string = distDir,
      pathContentMap: Record<string, string> = {}
   ) => {
      const files = await instance.fs.readdir(dirPath, {
         withFileTypes: true,
      });
      for (const file of files) {
         const path = `${dirPath}/${file.name}`;

         if (file.isDirectory()) {
            await traverse(path, pathContentMap);
            continue;
         }

         const extension = file.name.split('.').pop()!;
         const encoding = acceptedBinaryExtensions.includes(extension)
            ? 'base64'
            : 'utf-8';
         pathContentMap[toSnapshotPath(path)] =
            await instance.fs.readFile(path, encoding);
      }

      return pathContentMap;
   };

   const pack = await traverse();
   steps.value[1]!.status = 'completed';
   steps.value[2]!.status = 'inProgress';

   return pack;
};

const { $trpc } = useNuxtApp();
const runUploadStep = async (pack: Record<string, string>) => {
   const { judgeRecordId } = await atLeastTime(
      500,
      $trpc.protected.problem.commitAnswer.mutate({
         problemId: props.problemId,
         snapshot: pack,
      })
   );
   steps.value[2]!.status = 'completed';

   return judgeRecordId;
};

/**
 * 提交成功后要跳到 `/challenge/record/:pid`。
 *
 * ⚠️ 这里**必须用 `props.problemId`**（父级已经解析好的当前版本 pid），
 * 不能再从地址里取第 2 段：地址可能是 `/challenge/editor/by-base/6`，
 * 那一段是字符串 `by-base`，`Number('by-base')` 是 NaN ——
 * 提交后会跳到 `/challenge/record/NaN`（提交记录与排名都拿不到数据）。
 */
const commitEmitter = useEventBus<number>('challenge-commit');
const close = (recordId?: number) => {
   runningProcess?.kill();
   opened.value = false;
   commitEmitter.emit(recordId);
   if (!recordId) return;
   const pid = props.problemId;
   if (!Number.isInteger(pid) || pid <= 0) return;
   navigateTo(`/challenge/record/${pid}?id=${recordId}`);
};

const closable = computed(() => {
   return (
      currentStep.value === 0 || steps.value.some((s) => s.status === 'error')
   );
});
</script>

<template>
   <StModal v-model:opened="opened">
      <StModalWindow
         @close="close"
         title="正在准备提交"
         :closable="closable"
         class="border border-accent-500 w-[31.25rem]">
         <StSpace fill-x gap="1.25rem" direction="vertical" align="center">
            <StProgress
               direction="horizontal"
               :steps="steps"
               class="!w-[21.25rem]" />
            <main
               class="w-[28.75rem] h-[10.9375rem] rounded-[0.375rem] bg-[#1C1C1C] relative overflow-auto">
               <StSpace fill class="relative my-2 mx-3">
                  <main
                     :ref="containerKey"
                     class="absolute left-0 top-0 h-full"></main>
               </StSpace>
            </main>
         </StSpace>
      </StModalWindow>
   </StModal>
</template>
