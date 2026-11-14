import { registerPublishScheduledProblemHandler } from '../services/publish-scheduled-problem';
import { registerResetTaskHandler } from '../services/reset-task';
import { registerSendNotificationHandler } from '../services/send-notification';
import { registerJudgeQualityHandler } from '../services/judge-quality-task';
import { registerGitHubImportHandler } from '../services/github/import';
import { startTimerWorker, stopTimerWorker } from '../utils/timer';

/** 启动定时任务 Worker：定期轮询 timer_tasks 表，到期后执行已注册的处理器 */
export default defineNitroPlugin((nitro) => {
   registerResetTaskHandler();
   registerSendNotificationHandler();
   registerPublishScheduledProblemHandler();
   registerJudgeQualityHandler();
   registerGitHubImportHandler();

   const { timer } = useRuntimeConfig();
   startTimerWorker({
      ...timer,
      isolatedHandlers: [{
         handlerId: 'github-import',
         concurrency: timer.githubImportConcurrency,
         leaseMs: 10 * 60_000,
         clearPayload: true,
      }, {
         handlerId: 'judge-quality',
         concurrency: timer.qualityConcurrency,
         leaseMs: 5 * 60_000,
         clearPayload: true,
      }],
   });
   nitro.hooks.hook('close', stopTimerWorker);
});
