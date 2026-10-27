import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';
import { LRUMap } from '~~/server/utils/lru-map';
import { middleware } from '../trpc';

/** 记录用户「最近活跃时间」：受保护请求时刷新；按间隔节流、fire-and-forget 写库，失败只记日志。 */

/** key 是 userId，只保留最近活跃的一批用户，避免长跑进程内存无限增长 */
const lastWriteAt = new LRUMap<string, number>(10000);

const touchLastActiveAt = (userId: string) => {
   const now = Date.now();
   const previous = lastWriteAt.get(userId);
   if (
      previous !== undefined &&
      now - previous < useRuntimeConfig().trackActive.writeIntervalMs
   )
      return;

   lastWriteAt.set(userId, now);
   void prisma.user
      .update({
         where: { id: userId },
         data: { lastActiveAt: new Date(now) },
      })
      .catch((error) => {
         lastWriteAt.delete(userId);
         logger.error(error, '更新用户活跃时间失败');
      });
};

export const trackActive = middleware(async ({ ctx, next }) => {
   const userId = ctx.user?.userId;
   if (userId) {
      touchLastActiveAt(userId);
   }

   return next();
});
