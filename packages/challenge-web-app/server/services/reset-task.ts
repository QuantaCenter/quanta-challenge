import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';
import { registerTimerHandler } from '~~/server/utils/timer';
import { rankService } from '../trpc/services/rank';

/** 重置任务的载荷：userIds 为目标用户，problemIds 为题目的当前版本 pid（执行时会展开为该题全部历史版本）。 */
export type ResetProblemsPayload = {
   userIds: string[];
   problemIds: number[];
};

let registered = false;

/** 注册「重置题目」定时处理器，幂等；由 plugins/timer.ts 在服务启动时调用。 */
export function registerResetTaskHandler(): void {
   if (registered) return;
   registered = true;

   registerTimerHandler<ResetProblemsPayload>(
      'reset-problems',
      async ({ userIds, problemIds }) => {
         if (!userIds.length || !problemIds.length) {
            throw new Error('重置任务载荷不完整：缺少用户或题目');
         }

         // 题目按 baseId 展开到全部历史版本：计分按题目（baseId）取最高分，只删当前版本会残留旧版本成绩
         const baseIds = await prisma.problems
            .findMany({
               where: { pid: { in: problemIds } },
               select: { baseId: true },
            })
            .then((rows) => [...new Set(rows.map((row) => row.baseId))]);
         const pids = (
            await prisma.problems.findMany({
               where: { baseId: { in: baseIds } },
               select: { pid: true },
            })
         ).map((row) => row.pid);

         await prisma.$transaction(async (tx) => {
            // 判题记录：级联删除 ShadowFile
            await tx.judgeRecords.deleteMany({
               where: { userId: { in: userIds }, problemId: { in: pids } },
            });

            // 作答项目：先删文件系统（级联删虚拟文件），再删项目；下次访问会重新 fork 干净的模板项目
            const projects = await tx.projects.findMany({
               where: {
                  ownerId: { in: userIds },
                  problemId: { in: pids },
                  isTemplate: false,
               },
               select: { pid: true },
            });
            if (projects.length > 0) {
               await tx.fileSystems.deleteMany({
                  where: { projectId: { in: projects.map((p) => p.pid) } },
               });
               await tx.projects.deleteMany({
                  where: { pid: { in: projects.map((p) => p.pid) } },
               });
            }
         });

         // 拉取剩余全量成功记录重算得分（自动保留未撤销扣分的口径）、同步全局榜与缓存
         await rankService.syncUserScores(userIds);
         // 单题 Redis 榜仍含已删除的记录，全部失效后按需从数据库重建
         await rankService.invalidateRankings();

         logger.info(
            { userIds, problemIds, expandedPids: pids },
            '重置题目定时任务执行完成',
         );
      },
   );
}
