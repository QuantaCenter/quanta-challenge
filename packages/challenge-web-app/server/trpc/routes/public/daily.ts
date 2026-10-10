import z from 'zod';
import { TRPCError } from '@trpc/server';
import prisma from '~~/lib/prisma';
import { renderThumbhashDataUrl } from '~~/server/utils/thumbhash';
import {
   getDailyDateKey,
   isValidDateKey,
   toDailyDate,
} from '~~/server/utils/daily-date';
import { publicProcedure, router } from '../../trpc';
import { dailyService } from '../../services/daily';

const problemQuery = {
   // 题号（base_problems.id）：前端链接按它进，见设计文档 §17.7
   id: true,
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

const formatDailyProblem = async (baseProblem: BaseProblemRecord) => {
   const dailyProblem = baseProblem.CurrentProblem;
   if (!dailyProblem) {
      return null;
   }

   const { passedCount = 0, totalCount = 0 } = dailyProblem.JudgeStatus || {};
   const passRate = totalCount === 0 ? 0 : passedCount / totalCount;

   const image =
      dailyProblem.CoverImage ?? dailyProblem.ProblemDefaultCover?.[0]?.image;
   const coverImageThumbhash = image?.thumbhash ?? null;

   return {
      pid: dailyProblem.pid,
      // 题号：前端链接按它进（做题页按 baseId 解析当前版本，见 §17.7）
      baseId: baseProblem.id,
      title: dailyProblem.title,
      difficulty: dailyProblem.difficulty,
      tags: dailyProblem.tags,
      totalScore: dailyProblem.totalScore,
      passRate: passRate,
      coverImageName: image?.name ?? null,
      coverImageThumbhash,
      // 服务端带缓存地渲染占位图，SSR 首帧即可见
      coverImageThumbhashUrl: await renderThumbhashDataUrl(coverImageThumbhash),
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

/**
 * 业务口径的「今天」（YYYY-MM-DD，Asia/Shanghai）。
 *
 * SSR 渲染时会跑在容器本地时区（线上是 UTC），而浏览器跑在用户本地时区。
 * 前端若各自用 `dayjs()` 判断「今天」，北京时间 00:00–08:00 期间服务端会
 * 少算一天，导致 SSR 与水合后的日历/签到状态对不上。前端统一以这里返回的
 * 业务日期为准，就不会再受运行环境时区影响。
 */
const getTodayProcedure = publicProcedure.query(() => getDailyDateKey());

// 获取每日一题
const getDailyProblemProcedure = publicProcedure
   .input(getDailyProblemSchema)
   .query(async ({ input }) => {
      const todayKey = getDailyDateKey();
      const targetKey = input?.date ?? todayKey;

      if (!isValidDateKey(targetKey)) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '日期格式应为 YYYY-MM-DD',
         });
      }

      if (targetKey > todayKey) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '不能查询未来日期的每日一题',
         });
      }

      // 今日：查不到记录时自动抽取并落库
      if (targetKey === todayKey) {
         const result = await prisma.dailyProblem.findFirst({
            where: { date: toDailyDate(targetKey) },
            select: { baseProblem: { select: problemQuery } },
         });
         if (result) {
            return await formatDailyProblem(result.baseProblem);
         }

         const id = await dailyService.selectDailyProblem();
         return await formatDailyProblem(await findBaseProblemById(id));
      }

      // 往日：仅查询已存在的记录，不存在则视为当日无题目
      const result = await prisma.dailyProblem.findFirst({
         where: { date: toDailyDate(targetKey) },
         select: { baseProblem: { select: problemQuery } },
      });

      return result ? await formatDailyProblem(result.baseProblem) : null;
   });

export const dailyRouter = router({
   getProblem: getDailyProblemProcedure,
   getToday: getTodayProcedure,
});
