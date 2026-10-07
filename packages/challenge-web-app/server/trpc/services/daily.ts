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

/**
 * 抽取当日的每日一题
 * 1. 检查 Redis 缓存中是否已有今日题目。
 * 2. 若无缓存，从数据库中随机选择一个未被使用过的题目。
 * 3. 用 SET NX EX 原子地抢到当日选举锁，并设置过期时间为**次日**凌晨1点。
 * 4. 将选中的题目记录到数据库的 `daily_problems` 表中。
 * @returns 选中的题目 ID
 */
const selectDailyProblem = async () => {
   const dateKey = getDailyDateKey();
   const today = toDailyDate(dateKey);
   const redis = useRedis();
   const key = `daily_problem:${dateKey.replace(/-/g, '')}`;

   const cached = await redis.get(key);
   if (cached) {
      return parseInt(cached, 10);
   }

   let unusedBaseProblemId = (
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

/**
 * 计算当月连续签到天数
 * 1. 获取用户当月的所有签到记录，按日期降序排列。
 * 2. 遍历签到记录，计算从最近一次签到开始的连续签到天数。
 * 3. 如果遇到未连续的日期，则停止计数。
 * @param userId 用户 ID
 */
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

export const dailyService = {
   countContinuesCheckin,
   selectDailyProblem,
};
