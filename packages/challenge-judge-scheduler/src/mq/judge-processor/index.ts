import type { Job, Processor } from 'bullmq';
import type { JobType, JudgeMachineResult, JudgeResultType, ProcessResultType } from '../../events/index';
import type z from 'zod';
import { DockerService } from '../../services/docker';
import { judgeCloudFunctions } from '../../services/judge-cloud-function';
import type { TaskSchema } from '@challenge/judge-machine-agent/schemas';
import { EventEmitterService } from '../../utils/event-emitter';
import { EventType } from '../../events/index';
import type { IStoreService } from '../../utils/store';
import path from 'path';
import { LocalStoreService } from '../../utils/local-store';
import { ignoreError } from '../../utils/ignore-error';
import prisma from '../../utils/prisma';
import { generateThumbhashFromBuffer } from '@challenge/shared/thumbhash/server';
import { buildBackendInitCommand } from '@challenge/shared/backend-service-image';
import { createTraceId, getRequestContext, runWithRequestContext } from '@challenge/shared/trace';
import * as db from './db';
import { JudgeJob } from './types';
import { $Enums, type Prisma } from '@prisma/client';
import { TimingService } from '../../services/timing';
import { logger } from '../../utils/logger';
import {
   judgeResultsTotal,
   judgeTaskDurationSeconds,
   judgeTaskPendingSeconds,
} from '../../metrics';

type DesignCapture = { structure: $Enums.ProblemDesignMode; expectedScore: number };

async function saveProblemDesign(
   problemId: number,
   structure: $Enums.ProblemDesignMode,
   result: Extract<JudgeResultType, { type: 'done' }>,
) {
   const where = { problemId, mode: structure };
   if (result.designDocument?.structure === structure) {
      try {
         await prisma.problemDesign.updateMany({
            where: { ...where, status: { not: 'ready' } },
            data: {
               status: 'ready',
               document: result.designDocument as unknown as Prisma.InputJsonObject,
            },
         });
         return;
      } catch {
         // 设计稿写入失败不能回滚已经通过的审核。
         logger.warn({ problemId }, '通过审核后未能保存设计稿');
      }
   }

   try {
      const { count } = await prisma.problemDesign.updateMany({
         where: { ...where, status: 'pending' },
         data: { status: 'failed' },
      });
      if (count) logger.warn({ problemId, code: result.designError }, '通过审核后未能生成设计稿');
   } catch {
      logger.warn({ problemId }, '未能保存设计稿生成失败状态');
   }
}

const firstCommandOf = (raw: string | null | undefined): string => {
   if (!raw) return '';
   for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^\[(.+?)\]\s*(.+)$/);
      const command = (match ? match[2] : trimmed).trim();
      if (command) return command;
   }
   return '';
};

const sendTaskToJudgeMachine = async (options: {
   job: JudgeJob;
   networkUrl: string;
   /** 目标判题机的 WebSocket。前端 / 后端用各自的连接，但信封与回包格式一致。 */
   ws: WebSocket;
   designCapture?: DesignCapture;
   cloudFunctionName?: string;
}) => {
   const { job, networkUrl, ws, designCapture, cloudFunctionName } = options;
   const { judgeRecordId, judgeScript, mode } = job.data;

   const cacheFiles =
      mode === 'audit'
         ? undefined
         : await db.getTemplateJudgeRecordCacheFiles(job.data.problemId);

   type TaskType = z.infer<typeof TaskSchema>;
   const task = JSON.stringify({
      judgeRecordId,
      judgeScript,
      mode,
      url: networkUrl,
      info: cacheFiles,
      cloudFunctionName,
      designStructure: designCapture?.structure,
      designExpectedScore: designCapture?.expectedScore,
   } satisfies TaskType);
   const release = cloudFunctionName
      ? judgeCloudFunctions.register(ws, {
           judgeRecordId,
           name: cloudFunctionName,
           traceId: getRequestContext()?.traceId,
           designCapture: Boolean(designCapture),
        })
      : undefined;

   try {
      return await new Promise<JudgeResultType>((resolve, reject) => {
         const cleanUp = () => {
            EventEmitterService.instance.off(EventType.JUDGE_FINISHED, judgeFinished);
            clearTimeout(timer);
         };
         const judgeFinished = ({ socket, result }: JudgeMachineResult) => {
            if (socket !== ws || result.judgeRecordId !== judgeRecordId) return;
            cleanUp();
            resolve(result);
         };
         EventEmitterService.instance.on<JudgeMachineResult>(
            EventType.JUDGE_FINISHED,
            judgeFinished,
         );
         const timer = setTimeout(() => {
            cleanUp();
            reject(new Error('Judge Machine response timeout'));
         }, designCapture ? 60_000 : 30_000);
         try {
            if (ws.readyState !== WebSocket.OPEN) throw new Error('Judge machine is disconnected');
            ws.send(task);
         } catch (error) {
            cleanUp();
            reject(error);
         }
      });
   } finally {
      release?.();
   }
};

const processResult = async (
   options: {
      result: JudgeResultType;
      pendingTime: number;
      startTime: number;
      job: Job<JobType>;
      designCapture?: DesignCapture;
   },
   store: IStoreService
) => {
   const { result, pendingTime, startTime, job, designCapture } = options;

   if (result.type === 'error') {
      throw new Error(result.message || 'Unknown error from Judge Machine');
   }

   // 获取问题 ID 和问题总分
   const { problemId, score } = await db.getProblemInfoByRecordId(
      job.data.judgeRecordId
   );

   let firstScreen: { fileId: string; fileName: string; hash: string } | null =
      null;
   const firstScreenBuffer =
      job.data.mode === 'audit' ? result.firstScreen : undefined;
   if (firstScreenBuffer) {
      const fileId = await store.save(firstScreenBuffer, 'screenshot.png');
      firstScreen = {
         fileId,
         fileName: `${fileId}.png`,
         hash: await generateThumbhashFromBuffer(firstScreenBuffer),
      };
   }

   // 扁平化产生的文件记录
   const bufferRecords = result.results
      .map((item) => item.cacheFiles)
      .reduce((acc, curr) => ({ ...acc, ...curr }), {});

   // 保存文件到本地存储
   const storedBufferRecords: Record<string, string> = {};
   await Promise.all(
      Object.entries(bufferRecords).map(async ([fileName, buffer]) => {
         const fileId = await store.save(buffer, fileName);
         storedBufferRecords[fileName] = fileId + path.extname(fileName);
      })
   );

   await prisma.$transaction(
      async (tx) => {
         if (firstScreen) {
            await db.saveFirstScreen(tx, { ...firstScreen, problemId });
         }
         await db.createShadowFiles(tx, { job, storedBufferRecords });
         // 将结果中的文件 buffer 替换为存储的 URL，更新数据库记录
         await db.saveSuccessRecord(tx, {
            result,
            pendingTime,
            startTime,
            job,
            storedBufferRecords,
         });
      },
      { timeout: 10_000, maxWait: 5_000 }
   );

   // 返回是否通过审核
   const allPass = result.results.every((item) => item.status === 'pass');
   const auditPassed = allPass && result.totalScore === score;
   if (designCapture && auditPassed) {
      await saveProblemDesign(problemId, designCapture.structure, result);
   }
   return job.data.mode === 'audit' ? auditPassed : allPass;
};

export const judgeProcessor: Processor<JobType, ProcessResultType> = async (job) =>
   runWithRequestContext(
      {
         traceId: job.data.traceId ?? createTraceId(),
         userId: job.data.userId,
      },
      () => runJudgeJob(job),
   );

const runJudgeJob: Processor<JobType, ProcessResultType> = async (job) => {
   const pendingTime = Date.now() - job.data.queueTimestamp;
   const startTime = Date.now();
   const mode = String(job.data.mode);
   let cleanup: (() => Promise<void>) | undefined;
   const timer = TimingService.instance;
   const timingId = String(job.data.judgeRecordId);
   let outcome: 'pass' | 'fail' | 'error' = 'error';

   // 任务在队列中的等待时长
   judgeTaskPendingSeconds.observe({ mode }, pendingTime / 1000);

   try {
      const runtime = await timer.measure(timingId, '获取题目运行时信息', () =>
         db.getPendingJudgeRuntimeInfo(job.data)
      );
      if (!runtime) {
         logger.warn({ judgeRecordId: job.data.judgeRecordId }, '判题任务与待判记录不匹配或记录已结束');
         return {
            judgeRecordId: job.data.judgeRecordId,
            jobId: job.id,
            status: 'skipped',
            message: 'Judge task does not match a pending record',
         };
      }
      const cloudFunctionName = runtime.problemType === 'frontend'
         ? runtime.cloudFunctionName ?? undefined
         : undefined;
      const designCapture =
         job.data.mode === 'audit' && runtime.problemType === 'frontend' && runtime.ProblemDesign
            ? { structure: runtime.ProblemDesign.mode, expectedScore: runtime.totalScore }
            : undefined;

      let networkUrl: string;
      let judgeWs: WebSocket;

      if (runtime.problemType === $Enums.ProblemType.backend_service) {
         const startCommand =
            firstCommandOf(runtime.initCommand) ||
            firstCommandOf(
               buildBackendInitCommand(
                  runtime.serviceImage,
                  runtime.judgeUploadPath
               )
            );
         if (!startCommand) {
            throw new Error(
               `后端服务题目 ${job.data.problemId} 缺少启动命令（initCommand），无法启动服务`
            );
         }

         // 后端链路：预热缓存 + 离线安装 + 启动服务 + 等 Ready
         const service = await timer.measure(timingId, '启动后端服务容器', () =>
            DockerService.instance.startBackendServiceContainer({
               fsSnapshot: job.data.fsSnapshot,
               image: runtime.serviceImage ?? undefined,
               port: runtime.servicePort ?? 3000,
               startCommand,
               judgeUploadPath: runtime.judgeUploadPath,
               timingId,
            })
         );
         cleanup = service.close;
         await timer.measure(timingId, '等待后端服务就绪', () => service.waitForReady);
         networkUrl = service.networkUrl;
         judgeWs = await timer.measure(timingId, '启动后端判题机', () =>
            DockerService.instance.ensureBackendJudgeMachine()
         );
      } else {
         if (!DockerService.instance.judgeMachineWs) {
            throw new Error('Judge machine WebSocket is not connected');
         }

         // 启动 Live Server 容器
         const liveServer = await timer.measure(
            timingId,
            '启动 live-server 容器',
            () =>
               DockerService.instance.startLiveServerContainer(
                  job.data.fsSnapshot,
                  timingId
               )
         );
         cleanup = liveServer.close;

         // 等待容器就绪
         await timer.measure(
            timingId,
            '等待 live-server 就绪',
            () => liveServer.waitForReady
         );

         networkUrl = liveServer.networkUrl;
         judgeWs = DockerService.instance.judgeMachineWs;
      }

      // 发送任务到判题机（前端 / 后端同一套信封），等待返回结果
      const result = await timer.measure(timingId, '判题执行', () =>
         sendTaskToJudgeMachine({ job, networkUrl, ws: judgeWs, designCapture, cloudFunctionName })
      );

      // 处理 Judge Machine 返回的结果
      const pass = await timer.measure(timingId, '判题结果入库', () =>
         processResult(
            { result, pendingTime, startTime, job, designCapture },
            LocalStoreService.instance
         )
      );

      // 关闭题目容器（前端 live-server / 后端服务容器共用同一套 cleanup）
      if (cleanup) {
         const closeContainer = cleanup;
         await timer.measure(timingId, '清理题目容器', () => closeContainer());
         cleanup = undefined;
      }

      outcome = pass ? 'pass' : 'fail';

      return {
         judgeRecordId: job.data.judgeRecordId,
         jobId: job.id,
         status: pass ? 'completed' : 'failed',
         message: 'Judge task processed successfully',
      };
   } catch (error: any) {
      // 处理错误
      outcome = 'error';
      await db.saveErrorRecord({ error, pendingTime, startTime, job });
      // 必须清理：题目容器与 tmp/<uuid> 快照目录不会自动消失， 原实现把这行注释掉后，每次失败判题都会永久残留一个容器和一份临时文件， 长期运行会把磁盘吃满。cleanup 本身是幂等的（force: true / ignoreError）。
      if (cleanup) {
         const closeContainer = cleanup;
         await timer.measure(timingId, '清理题目容器', () =>
            ignoreError(() => closeContainer())
         );
      }

      return {
         judgeRecordId: job.data.judgeRecordId,
         jobId: job.id,
         status: 'failed',
         message: error.message || 'Unknown error occurred',
      };
   } finally {
      judgeResultsTotal.inc({ mode, outcome });
      judgeTaskDurationSeconds.observe(
         { mode, outcome },
         (Date.now() - startTime) / 1000
      );
      // 兜底：异常退出时清掉未结算的计时，避免残留。
      timer.clear(timingId);
   }
};
