import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';

// 定时发布轮询：把 scheduledPublishAt 已到点且仍处于 ready 状态的题目翻成 published。
// 只发布 BaseProblem.currentPid 指向的版本；被新版本取代的旧版本只清掉定时标记。
export default defineNitroPlugin(() => {
   const publishDueProblems = async () => {
      try {
         const due = await prisma.problems.findMany({
            where: {
               status: 'ready',
               scheduledPublishAt: { lte: new Date() },
            },
            select: {
               pid: true,
               BaseProblem: {
                  select: { currentPid: true },
               },
            },
         });

         for (const problem of due) {
            const isCurrentVersion =
               !problem.BaseProblem.currentPid ||
               problem.BaseProblem.currentPid === problem.pid;
            await prisma.problems.update({
               where: { pid: problem.pid },
               data: {
                  status: isCurrentVersion ? 'published' : undefined,
                  scheduledPublishAt: null,
               },
            });
            logger.info(
               {
                  problemId: problem.pid,
                  published: isCurrentVersion,
               },
               '定时发布执行完成'
            );
         }
      } catch (error) {
         logger.error({ err: error }, '定时发布轮询失败');
      }
   };

   setInterval(publishDueProblems, 30_000);
});
