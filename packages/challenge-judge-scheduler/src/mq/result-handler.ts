import { EventType, type ITaskCompletedPayload } from '../events/index';
import { EventEmitterService } from '../utils/event-emitter';
import { logger } from '../utils/logger';
import { url } from '@challenge/shared/utils';
import prisma from '../utils/prisma';
import { generateOpenApiSign } from '@challenge/shared/openapi';

const requestWebhook = async (data: { judgeRecordId: number }) => {
   const { judgeRecordId } = data;
   const appServerUrl = process.env.APP_SERVER_URL || 'http://localhost:3000';

   const params = { recordId: judgeRecordId.toString() };
   const path = '/api/webhooks/judge-complete';
   const timestamp = Date.now();

   const sign = generateOpenApiSign({
      secret: process.env.OPENAPI_WEBHOOK_SECRET || 'default_secret',
      timestamp,
      params,
      path,
   });
   const cookie = `webhook_timestamp=${timestamp}; sign=${sign};`;

   const callbackUrl = url(appServerUrl, path, params);

   return fetch(callbackUrl, { headers: { Cookie: cookie } }).catch((e) =>
      logger.error({ err: e }, 'Error sending judge-complete callback')
   );
};

export const initTaskResultHandlers = () => {
   const setStatus = async (
      judgeRecordId: number,
      status: 'ready' | 'invalid',
      mode: 'judge' | 'audit'
   ) => {
      const { problemId } = await prisma.judgeRecords.findUniqueOrThrow({
         where: {
            id: judgeRecordId,
         },
         select: { problemId: true },
      });
      if (mode === 'audit') {
         await prisma.problems.update({
            where: {
               pid: problemId,
            },
            data: { status },
         });
      }
   };

   /** emit 直接调用这些 async 监听器且无人 await，内部一旦拒绝会成为 unhandledRejection，故统一包一层兜底。 */
   const safeHandler =
      (name: string, fn: (payload: any) => Promise<void>) =>
      (payload: any) => {
         Promise.resolve(fn(payload)).catch((e) =>
            logger.error({ err: e }, `${name} 处理失败（已忽略，不影响进程）`),
         );
      };

   EventEmitterService.instance.on<ITaskCompletedPayload>(
      EventType.TASK_COMPLETED,
      safeHandler('TASK_COMPLETED', async ({ job, result }) => {
         if (!job?.data) {
            logger.warn(
               `TASK_COMPLETED 缺少 job，已忽略: ${JSON.stringify(result)}`
            );
            return;
         }
         logger.info(
            { 'quanta.judge.record_id': String(job.data.judgeRecordId) },
            `Task completed for job ${job.id}`
         );
         const status =
            result.type === 'error'
               ? 'invalid'
               : result.status === 'completed'
               ? 'ready'
               : 'invalid';
         await setStatus(job.data.judgeRecordId, status, job.data.mode);
         requestWebhook(job.data);
      })
   );

   EventEmitterService.instance.on(
      EventType.TASK_FAILED,
      safeHandler('TASK_FAILED', async ({ job, error }: { job?: any; error?: any }) => {
         // 空值保护：worker 的 'error' 事件不带 job，若直接访问 job.id 会抛 TypeError
         // 并让整个调度器进程退出（这正是之前"判题判着判着服务就没了"的原因）。
         logger.error(
            {
               err: error,
               ...(job?.data
                  ? { 'quanta.judge.record_id': String(job.data.judgeRecordId) }
                  : {}),
            },
            `Task failed for job ${job?.id ?? '<unknown>'}`
         );
         if (!job?.data) return;
         await setStatus(job.data.judgeRecordId, 'invalid', job.data.mode);
         requestWebhook(job.data);
      })
   );

   EventEmitterService.instance.on(
      EventType.TASK_ERROR,
      safeHandler(
         'TASK_ERROR',
         async ({ job, error, err }: { job?: any; error?: any; err?: any }) => {
            // 该类事件可能只带 err（BullMQ 'error'，例如 Redis ECONNRESET），没有 job。
            // 这类是基础设施瞬时故障，不应终止进程，也不该改动任何判题记录状态。
            const detail = error ?? err;
            if (!job?.data) {
               logger.warn(
                  `判题 worker 报错（无关联任务，可能是 Redis/队列瞬时故障，已忽略）: ` +
                     `${detail?.message ?? detail}`,
               );
               return;
            }
            logger.error(
               {
                  err: detail,
                  'quanta.judge.record_id': String(job.data.judgeRecordId),
               },
               `Task error for job ${job.id}`
            );
            await setStatus(job.data.judgeRecordId, 'invalid', job.data.mode);
            requestWebhook(job.data);
         },
      )
   );
};
