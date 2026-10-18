import { TRPCError } from '@trpc/server';
import prisma from '~~/lib/prisma';
import {
   fromDailyDate,
   getDailyDateKey,
   previousDateKey,
   secondsUntilDailyCacheExpiry,
   toDailyDate,
} from '~~/server/utils/daily-date';

/** Prisma 唯一约束冲突（P2002）。用结构判断，避免依赖具体 Prisma 实例。 */
const isUniqueConstraintError = (error: unknown): boolean =>
   typeof error === 'object' &&
   error !== null &&
   (error as { code?: string }).code === 'P2002';

/** 从「未被当日抽取过且当前已发布」的题目里随机挑一道 */
const pickUnusedPublishedBaseProblemId = async () => {
   return (
      await prisma.$queryRaw<{ id: number }[]>`
         SELECT id FROM base_problems
         LEFT JOIN problems
           ON base_problems."currentPid" = problems.pid
         WHERE id NOT IN (SELECT "baseProblemId" FROM daily_problems)
           AND problems.pid IS NOT NULL
           AND problems.status = 'published'
         ORDER BY RANDOM()
         LIMIT 1
      `
   )[0]?.id;
};

const selectDailyProblemFallback = async () => {
   const fallbackBaseProblemId = (
      await prisma.$queryRaw<{ id: number }[]>`
         SELECT dp."baseProblemId" AS id
         FROM daily_problems dp
         JOIN base_problems bp ON bp.id = dp."baseProblemId"
         LEFT JOIN problems p ON bp."currentPid" = p.pid
         WHERE p.pid IS NOT NULL
           AND p.status = 'published'
         GROUP BY dp."baseProblemId"
         ORDER BY MAX(dp.date) ASC
         LIMIT 1
      `
   )[0]?.id;
   if (fallbackBaseProblemId === void 0) {
      throw new TRPCError({
         code: 'INTERNAL_SERVER_ERROR',
         message: 'No base problem available for daily challenge',
      });
   }
   return fallbackBaseProblemId;
};

/** 抽取当日每日一题：查缓存 → 随机选未用题 → SET NX EX 抢选举锁（过期次日 01:00）→ 记入 daily_problems。 */
const selectDailyProblem = async () => {
   const dateKey = getDailyDateKey();
   const today = toDailyDate(dateKey);
   const redis = useRedis();
   const key = `daily_problem:${dateKey.replace(/-/g, '')}`;

   const cached = await redis.get(key);
   if (cached) {
      return parseInt(cached, 10);
   }

   let unusedBaseProblemId = await pickUnusedPublishedBaseProblemId();
   if (unusedBaseProblemId === void 0) {
      unusedBaseProblemId = await selectDailyProblemFallback();
   }

   const ttlSeconds = secondsUntilDailyCacheExpiry(dateKey);
   const success = await redis.set(
      key,
      unusedBaseProblemId.toString(),
      'EX',
      ttlSeconds,
      'NX',
   );

   if (success) {
      try {
         await prisma.dailyProblem.create({
            data: {
               date: today,
               baseProblemId: unusedBaseProblemId,
            },
         });
      } catch (error) {
         // 并发下锁过期、或本进程刚重启缓存为空时，date 唯一索引可能已存在。
         // 这不是错误：以库里已有的记录为准，避免把请求打成 500。
         if (!isUniqueConstraintError(error)) throw error;

         const existing = await prisma.dailyProblem.findUnique({
            where: { date: today },
            select: { baseProblemId: true },
         });
         if (existing) {
            return existing.baseProblemId;
         }
         throw error;
      }
      return unusedBaseProblemId;
   }

   // 没抢到锁：另一个请求正在选举，稍后读缓存即可。
   const elected = await redis.get(key);
   if (elected) {
      return parseInt(elected, 10);
   }

   // 缓存缺失（锁过期/写入失败）时的最后兜底：直接问数据库。
   const existing = await prisma.dailyProblem.findUnique({
      where: { date: today },
      select: { baseProblemId: true },
   });
   if (existing) {
      return existing.baseProblemId;
   }

   throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve daily problem',
   });
};

/** 计算当月连续签到天数（按日期降序遍历，遇到不连续即停止）。 */
const countContinuesCheckin = async (userId: string) => {
   // 按业务时区确定当月一号；落库值是 UTC 零点，查询也必须用它构造。
   const nowKey = getDailyDateKey();
   const monthKey = `${nowKey.slice(0, 7)}-01`;
   let count = 0;

   const checkins = await prisma.dailyCheckin.findMany({
      where: {
         userId,
         date: { gte: toDailyDate(monthKey) },
      },
      orderBy: { date: 'desc' },
   });

   // 统一还原成业务日期键再比较，不依赖运行环境的本地时区。
   const checkinKeys = checkins.map((checkin) => fromDailyDate(checkin.date));

   for (let i = 0; i < checkinKeys.length; i++) {
      if (i === 0) {
         const yesterdayKey = previousDateKey(nowKey);
         if (checkinKeys[i] === nowKey || checkinKeys[i] === yesterdayKey) {
            count++;
         } else {
            break;
         }
      } else if (checkinKeys[i] === previousDateKey(checkinKeys[i - 1])) {
         count++;
      } else {
         break;
      }
   }

   return count;
};

/**
 * 当日每日一题被取消发布时换题：清 Redis 缓存 → 重选已发布题 → 覆盖当日记录与缓存。
 * 必须先清缓存，否则换题后仍会读回旧题目 ID。
 */
const replaceUnpublishedDailyProblem = async (dateKey: string) => {
   const date = toDailyDate(dateKey);
   const redis = useRedis();
   const key = `daily_problem:${dateKey.replace(/-/g, '')}`;

   await redis.del(key);

   let newId = await pickUnusedPublishedBaseProblemId();
   if (newId === void 0) {
      newId = await selectDailyProblemFallback();
   }

   await prisma.dailyProblem.update({
      where: { date },
      data: { baseProblemId: newId },
   });
   await redis.set(
      key,
      newId.toString(),
      'EX',
      secondsUntilDailyCacheExpiry(dateKey),
   );

   return newId;
};

export const dailyService = {
   countContinuesCheckin,
   selectDailyProblem,
   replaceUnpublishedDailyProblem,
};
