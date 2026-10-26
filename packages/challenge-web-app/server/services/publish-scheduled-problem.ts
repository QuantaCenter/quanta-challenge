import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';
import { dispatchTimerTask, registerTimerHandler } from '../utils/timer';

const HANDLER_ID = 'publish-scheduled-problem';

// 执行发布：仅当题目仍处于 ready 且定时时间已到才翻转状态。
// 执行前被立即发布/取消发布/改期/取消定时抢先的题目会在状态检查处静默跳过。
const publishIfDue = async (problemId: number) => {
   const problem = await prisma.problems.findUnique({
      where: { pid: problemId },
      select: {
         status: true,
         scheduledPublishAt: true,
         BaseProblem: { select: { currentPid: true } },
      },
   });
   if (
      !problem ||
      problem.status !== 'ready' ||
      problem.scheduledPublishAt == null ||
      problem.scheduledPublishAt > new Date()
   ) {
      return;
   }

   // 只发布当前版本；被新版本取代的旧版本只清掉定时标记
   const isCurrentVersion =
      !problem.BaseProblem.currentPid ||
      problem.BaseProblem.currentPid === problemId;
   await prisma.problems.update({
      where: { pid: problemId },
      data: {
         status: isCurrentVersion ? 'published' : undefined,
         scheduledPublishAt: null,
      },
   });
   logger.info(
      { problemId, published: isCurrentVersion },
      '定时发布执行完成',
   );
};

export const registerPublishScheduledProblemHandler = () => {
   registerTimerHandler<{ problemId: number }>(HANDLER_ID, async (payload) => {
      await publishIfDue(payload.problemId);
   });
};

/**
 * 投递题目定时发布任务（题目须处于 ready 且带定时时间，否则忽略）。
 * 会先清掉该题旧的 pending 任务再投递，改期/重设定时不会堆积任务；
 * 过去的 runAt 会被 Worker 立即领取，用于 audit 通过晚于定时时间的补偿。
 */
export const dispatchPublishScheduledTask = async (problemId: number) => {
   const problem = await prisma.problems.findUnique({
      where: { pid: problemId },
      select: { status: true, scheduledPublishAt: true },
   });
   if (problem?.status !== 'ready' || problem.scheduledPublishAt == null) {
      return;
   }
   await prisma.timerTask.deleteMany({
      where: {
         handlerId: HANDLER_ID,
         status: 'pending',
         payload: { equals: { problemId } },
      },
   });
   await dispatchTimerTask(
      HANDLER_ID,
      { problemId },
      { runAt: problem.scheduledPublishAt },
   );
};
