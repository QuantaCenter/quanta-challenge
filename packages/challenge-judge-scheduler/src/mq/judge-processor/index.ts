import type { Job, Processor } from 'bullmq';
import type { JobType, JudgeResultType } from '../../events/index';
import type z from 'zod';
import { DockerService } from '../../services/docker';
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
import * as db from './db';
import { JudgeJob } from './types';
import { $Enums } from '@prisma/client';
import { TimingService } from '../../services/timing';

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
}) => {
   const { job, networkUrl, ws } = options;

   const cacheFiles =
      job.data.mode === 'audit'
         ? undefined
         : await db.getTemplateJudgeRecordCacheFiles(job.data.problemId);

   type TaskType = z.infer<typeof TaskSchema>;
   ws.send(
      JSON.stringify({
         judgeRecordId: job.data.judgeRecordId,
         judgeScript: job.data.judgeScript,
         mode: job.data.mode,
         url: networkUrl,
         info: cacheFiles,
      } satisfies TaskType)
   );

   const result = await new Promise<JudgeResultType>((resolve, reject) => {
      const off = () => {
         EventEmitterService.instance.off(
            EventType.JUDGE_FINISHED,
            judgeFinished
         );
      };
      const judgeFinished = async (payload: JudgeResultType) => {
         if (payload.judgeRecordId !== job.data.judgeRecordId) return;
         off();
         clearTimeout(timer);
         resolve(payload);
      };
      EventEmitterService.instance.on<JudgeResultType>(
         EventType.JUDGE_FINISHED,
         judgeFinished
      );
      const timer = setTimeout(() => {
         off();
         reject(new Error('Judge Machine response timeout'));
      }, 30 * 1000); // 超时处理
   });

   return result;
};

const processResult = async (
   options: {
      result: JudgeResultType;
      pendingTime: number;
      startTime: number;
      job: Job<JobType>;
   },
   store: IStoreService
) => {
   const { result, pendingTime, startTime, job } = options;

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
   return job.data.mode === 'audit'
      ? allPass && result.totalScore === score
      : allPass;
};

export const judgeProcessor: Processor<JobType> = async (job) => {
   const pendingTime = Date.now() - job.data.queueTimestamp;
   const startTime = Date.now();
   let cleanup: (() => Promise<void>) | undefined;
   const timer = TimingService.instance;
   const timingId = String(job.data.judgeRecordId);

   try {
      const runtime = await timer.measure(timingId, '获取题目运行时信息', () =>
         db.getProblemRuntimeInfo(job.data.problemId)
      );

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
         sendTaskToJudgeMachine({ job, networkUrl, ws: judgeWs })
      );

      // 处理 Judge Machine 返回的结果
      const pass = await timer.measure(timingId, '判题结果入库', () =>
         processResult(
            { result, pendingTime, startTime, job },
            LocalStoreService.instance
         )
      );

      // 关闭题目容器（前端 live-server / 后端服务容器共用同一套 cleanup）
      if (cleanup) {
         const closeContainer = cleanup;
         await timer.measure(timingId, '清理题目容器', () => closeContainer());
         cleanup = undefined;
      }

      return {
         judgeRecordId: job.data.judgeRecordId,
         jobId: job.id,
         status: pass ? 'completed' : 'failed',
         message: 'Judge task processed successfully',
      };
   } catch (error: any) {
      // 处理错误
      await db.saveErrorRecord({ error, pendingTime, startTime, job });
      // 必须清理：题目容器与 tmp/<uuid> 快照目录不会自动消失，
      // 原实现把这行注释掉后，每次失败判题都会永久残留一个容器和一份临时文件，
      // 长期运行会把磁盘吃满。cleanup 本身是幂等的（force: true / ignoreError）。
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
      // 兜底：异常退出时清掉未结算的计时，避免残留。
      timer.clear(timingId);
   }
};
