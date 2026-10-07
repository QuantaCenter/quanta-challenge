import z from 'zod';
import { TRPCError } from '@trpc/server';
import dayjs from 'dayjs';
import prisma from '~~/lib/prisma';
import { publicProcedure, router } from '../../trpc';
import { dailyService } from '../../services/daily';

const problemQuery = {
   CurrentProblem: {
      select: {
         pid: true,
         title: true,
         difficulty: true,
         totalScore: true,
         tags: { select: { color: true, name: true } },
         CoverImage: { select: { name: true, thumbhash: true } },
         JudgeStatus: { select: { totalCount: true, passedCount: true } },
         ProblemDefaultCover: {
            select: { image: { select: { name: true, thumbhash: true } } },
         },
      },
   },
};

const findBaseProblemById = (id: number) =>
   prisma.baseProblems.findUniqueOrThrow({
      where: { id },
      select: problemQuery,
   });

type BaseProblemRecord = Awaited<ReturnType<typeof findBaseProblemById>>;

const formatDailyProblem = (baseProblem: BaseProblemRecord) => {
   const dailyProblem = baseProblem.CurrentProblem;
   if (!dailyProblem) {
      return null;
   }

   const { passedCount = 0, totalCount = 0 } = dailyProblem.JudgeStatus || {};
   const passRate = totalCount === 0 ? 0 : passedCount / totalCount;

   const image =
      dailyProblem.CoverImage ?? dailyProblem.ProblemDefaultCover?.[0]?.image;

   return {
      pid: dailyProblem.pid,
      title: dailyProblem.title,
      difficulty: dailyProblem.difficulty,
      tags: dailyProblem.tags,
      totalScore: dailyProblem.totalScore,
      passRate: passRate,
      coverImageName: image?.name ?? null,
      coverImageThumbhash: image?.thumbhash ?? null,
   };
};

const getDailyProblemSchema = z
   .object({
      // 查询指定日期的每日一题，格式为 YYYY-MM-DD；不传则查询今日
      date: z
         .string()
         .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
         .optional(),
   })
   .optional();

// 获取每日一题
const getDailyProblemProcedure = publicProcedure
   .input(getDailyProblemSchema)
   .query(async ({ input }) => {
      const today = dayjs().startOf('day');
      const targetDate = input?.date ? dayjs(input.date).startOf('day') : today;

      if (targetDate.isAfter(today, 'day')) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '不能查询未来日期的每日一题',
         });
      }

      // 今日：查不到记录时自动抽取并落库
      if (targetDate.isSame(today, 'day')) {
         const result = await prisma.dailyProblem.findFirst({
            where: { date: today.toDate() },
            select: { baseProblem: { select: problemQuery } },
         });
         if (result) {
            return formatDailyProblem(result.baseProblem);
         }

         const id = await dailyService.selectDailyProblem();
         return formatDailyProblem(await findBaseProblemById(id));
      }

      // 往日：仅查询已存在的记录，不存在则视为当日无题目
      const result = await prisma.dailyProblem.findFirst({
         where: { date: targetDate.toDate() },
         select: { baseProblem: { select: problemQuery } },
      });

      return result ? formatDailyProblem(result.baseProblem) : null;
   });

export const dailyRouter = router({
   getProblem: getDailyProblemProcedure,
});
