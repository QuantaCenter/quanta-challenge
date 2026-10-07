import prisma from '~~/lib/prisma';
import { logger } from '~~/lib/logger';
import { LRUMap } from '~~/server/utils/lru-map';
import { middleware } from '../trpc';

/**
 * 记录用户「最近活跃时间」。
 *
 * `users.lastActiveAt` 只在用户真的发出受保护请求时刷新（登录、浏览、提交、
 * 做题都会经过这里），而不是只依赖 `lastLogin`（那个只在登录那一刻写一次）。
 *
 * 两个约束：
 * - 不能让每个请求都写一次库：同一个用户 `WRITE_INTERVAL` 内只落一次，
 *   中间态拿内存里的时间戳挡掉即可，精度对「活跃时间」这个用途完全够。
 * - 不能阻塞请求：写库是 fire-and-forget，失败只记日志（失败时清掉节流记录，
 *   下次请求会重试）。
 */
const WRITE_INTERVAL = 5 * 60 * 1000;

/** key 是 userId，只保留最近活跃的一批用户，避免长跑进程内存无限增长 */
const lastWriteAt = new LRUMap<string, number>(10000);

const touchLastActiveAt = (userId: string) => {
   const now = Date.now();
   const previous = lastWriteAt.get(userId);
   if (previous !== undefined && now - previous < WRITE_INTERVAL) return;

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
