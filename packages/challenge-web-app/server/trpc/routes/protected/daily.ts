import z from 'zod';
import prisma from '~~/lib/prisma';
import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import { TRPCError } from '@trpc/server';
import { dailyService } from '../../services/daily';
import {
   fromDailyDate,
   getDailyDateKey,
   secondsUntilNextDailyDay,
   toDailyDate,
} from '~~/server/utils/daily-date';

function hasDailyCheckin(userId: string, date: Date) {
   return prisma.dailyCheckin.findFirst({
      where: { userId, date },
   });
}

const hasCheckedinProcedure = protectedProcedure.query(async ({ ctx }) => {
   const { userId } = ctx.user;
   const today = toDailyDate(getDailyDateKey());
   const checkin = await hasDailyCheckin(userId, today);
   return !!checkin;
});

const hasCompletedDailyProblemProcedure = protectedProcedure.query(
   async ({ ctx }) => {
      const { userId } = ctx.user;

      const dailyProblem = await prisma.dailyProblem.findFirst({
         orderBy: { id: 'desc' },
         select: { baseProblemId: true },
      });
      if (!dailyProblem) {
         return false;
      }

      const record = await prisma.judgeRecords.findFirst({
         where: {
            userId,
            problem: {
               baseId: dailyProblem.baseProblemId,
            },
            result: 'success',
            type: 'judge',
         },
      });
      return !!record;
   }
);

const dailyCheckinProcedure = protectedProcedure.mutation(async ({ ctx }) => {
   const { userId } = ctx.user;
   const today = toDailyDate(getDailyDateKey());

   const hasCheckin = await hasDailyCheckin(userId, today);
   if (hasCheckin) {
      throw new TRPCError({
         code: 'BAD_REQUEST',
         message: 'Already checked in today',
      });
   }

   const { baseProblemId: dailyProblemId } =
      await prisma.dailyProblem.findFirstOrThrow({
         orderBy: { id: 'desc' },
         select: { baseProblemId: true },
      });
   const existingCompleteRecord = await prisma.judgeRecords.findFirst({
      where: {
         userId,
         result: 'success',
         type: 'judge',
         problem: {
            baseId: dailyProblemId,
         },
      },
   });
   if (!existingCompleteRecord) {
      throw new TRPCError({
         code: 'BAD_REQUEST',
         message: 'Please complete the daily challenge before checking in',
      });
   }

   const redis = useRedis();
   const cacheKey = `daily:continues-checkin-count:${userId}`;
   const countCache = await redis.get(cacheKey);
   const count = cacheKey
      ? Number(countCache)
      : await dailyService.countContinuesCheckin(userId);

   await Promise.all([
      redis.set(cacheKey, (count + 1).toString(), 'EX', 24 * 60 * 60),
      prisma.dailyCheckin.create({
         data: { userId, date: today },
      }),
   ]);

   return { success: true };
});

const continuesCheckinCountProcedure = protectedProcedure.query(
   async ({ ctx }) => {
      const { userId } = ctx.user;

      const redis = useRedis();
      const cacheKey = `daily:continues-checkin-count:${userId}`;
      const cachedCount = await redis.get(cacheKey);
      if (cachedCount) {
         return parseInt(cachedCount, 10);
      }

      const count = await dailyService.countContinuesCheckin(userId);

      // 缓存到业务日次日 0 点，避免跨天后仍然回上一次的连签天数。
      await redis.set(
         cacheKey,
         count.toString(),
         'EX',
         secondsUntilNextDailyDay()
      );

      return count;
   }
);

const GetCheckedinDatesSchema = z.object({
   startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
   endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
});

/**
 * 查询指定日期区间内，用户已签到的日期列表。
 * 签到的前提是当天已完成当日每日一题，因此直接以签到记录作为「当天完成」的标记。
 */
const getCheckedinDatesProcedure = protectedProcedure
   .input(GetCheckedinDatesSchema)
   .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const start = toDailyDate(input.startDate);
      const end = toDailyDate(input.endDate);

      if (end < start) {
         return [];
      }

      const checkins = await prisma.dailyCheckin.findMany({
         where: {
            userId,
            date: { gte: start, lte: end },
         },
         select: { date: true },
      });

      return checkins.map((checkin) => fromDailyDate(checkin.date));
   });

export const dailyRouter = router({
   checkin: dailyCheckinProcedure,
   hasCheckedin: hasCheckedinProcedure,
   hasCompletedDailyProblem: hasCompletedDailyProblemProcedure,
   continuesCheckinCount: continuesCheckinCountProcedure,
   getCheckedinDates: getCheckedinDatesProcedure,
});
