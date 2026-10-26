import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';
import { dispatchTimerTask, registerTimerHandler } from '../utils/timer';

const HANDLER_ID = 'publish-scheduled-problem';

// 条件更新防止与改期/立即发布并发冲突，未命中则静默跳过
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

   // 非当前版本仅清除定时标记，不翻转状态
   const isCurrentVersion =
      !problem.BaseProblem.currentPid ||
      problem.BaseProblem.currentPid === problemId;
   const { count } = await prisma.problems.updateMany({
      where: {
         pid: problemId,
         status: 'ready',
         scheduledPublishAt: problem.scheduledPublishAt,
         ...(isCurrentVersion && {
            BaseProblem: { currentPid: problem.BaseProblem.currentPid ?? null },
         }),
      },
      data: {
         status: isCurrentVersion ? 'published' : undefined,
         scheduledPublishAt: null,
      },
   });
   if (count > 0) {
      logger.info(
         { problemId, published: isCurrentVersion },
         '定时发布执行完成',
      );
   }
};

export const registerPublishScheduledProblemHandler = () => {
   registerTimerHandler<{ problemId: number }>(HANDLER_ID, async (payload) => {
      await publishIfDue(payload.problemId);
   });
};

/** 清除该题目的 pending 定时发布任务 */
export const cancelPublishScheduledTask = async (problemId: number) => {
   await prisma.timerTask.deleteMany({
      where: {
         handlerId: HANDLER_ID,
         status: 'pending',
         payload: { equals: { problemId } },
      },
   });
};

/** 投递定时发布任务：先清除旧 pending 任务，非 ready 或未设定时则忽略 */
export const dispatchPublishScheduledTask = async (problemId: number) => {
   const problem = await prisma.problems.findUnique({
      where: { pid: problemId },
      select: { status: true, scheduledPublishAt: true },
   });
   await cancelPublishScheduledTask(problemId);
   if (problem?.status !== 'ready' || problem.scheduledPublishAt == null) {
      return;
   }
   await dispatchTimerTask(
      HANDLER_ID,
      { problemId },
      { runAt: problem.scheduledPublishAt },
   );
};
