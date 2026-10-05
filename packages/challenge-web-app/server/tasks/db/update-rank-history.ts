import dayjs from 'dayjs';
import { logger } from '~~/lib/logger';
import prisma from '~~/lib/prisma';
import { rankService } from '../../trpc/services/rank';

/**
 * 定时任务：更新排行榜历史数据
 */
export default defineTask({
   meta: {
      name: 'db:update-rank-history',
      description: 'Update rank history from Redis to database',
   },
   run: async () => {
      logger.info('[Job:UpdateRankHistory] Starting job...');
      const redis = useRedis();
      const jobKey = 'job:update-rank-history';

      const success = await redis.setnx(jobKey, 'running');
      if (!success) {
         logger.warn(
            '[Job:UpdateRankHistory] Another instance is running, skip this execution.',
         );
         return { result: [] };
      }

      const data: { userId: string; score: number; rank: number }[] = [];

      try {
         const rankingKey = 'global:rankings';

         const existRanking = await redis.exists(rankingKey);
         if (!existRanking) {
            logger.info(
               '[Job:UpdateRankHistory] Global rankings not exist, loading...',
            );
            await rankService.loadGlobalRankings();
         }

         // 必须用 zrevrange（分数从高到低），否则最低分会拿到第 1 名。
         // 详见 services/rank.ts 中 captureRankingSnapshot 的说明：
         // zrange 是升序，而名次必须按降序计算，二者混用会让排名历史错乱。
         const userScores = await redis.zrevrange(rankingKey, 0, -1, 'WITHSCORES');
         for (let i = 0; i < userScores.length; i += 2) {
            data.push({
               userId: userScores[i],
               score: parseInt(userScores[i + 1]),
               rank: i / 2 + 1,
            });
         }

         const date = dayjs().startOf('day').toDate();

         // 兜底：排行榜为空时（例如 Redis 缓存刚被清空、数据库也还没有任何统计）
         // 不要执行 delete + createMany，否则会把当天已有的历史清空。
         // 同时这也是历史 bug 的爆点：createMany({ data: [] }) 会让
         // TrackWrapper 在 Object.entries(undefined) 上抛
         // "Cannot convert undefined or null to object"，导致整个定时任务失败。
         if (data.length === 0) {
            logger.warn(
               '[Job:UpdateRankHistory] Global rankings is empty, skip writing snapshot.',
            );
            return { result: [] };
         }

         await prisma.$transaction(async (tx) => {
            await tx.rankingHistory.deleteMany({
               where: { date },
            });
            await tx.rankingHistory.createMany({
               data: data.map(({ userId, score, rank }) => ({
                  userId,
                  score,
                  rank,
                  date,
               })),
               skipDuplicates: true,
            });
         });
      } catch (error) {
         // pino 签名是 logger.error(obj, msg)；直接传 Error 会被当作消息参数而丢失堆栈，
         // 必须放在对象里（err 字段）才会被正确序列化。
         logger.error(
            { err: error },
            '[Job:UpdateRankHistory] Failed to update rank history.',
         );
         // logger.log 不存在（pino 没有该方法），用 info
         logger.info({ data }, '[Job:UpdateRankHistory] Data:');
         return { result: [] };
      } finally {
         await redis.del(jobKey);
      }

      return { result: data };
   },
});
