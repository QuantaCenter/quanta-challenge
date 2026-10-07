import prisma from '~~/lib/prisma';
import { renderThumbhashDataUrls } from '~~/server/utils/thumbhash';
import { publicProcedure, router } from '../../trpc';
import z from 'zod';

// 每页默认返回的题目数量
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;

// 获取所有公开题目（游标分页，cursor 为上一页最后一条 baseProblems.id）
const GetAllPublicProblemsSchema = z.object({
   tids: z.array(z.number('Tag ID must be a number')).optional(),
   difficulty: z.enum(['easy', 'medium', 'hard', 'very_hard']).optional(),
   keyword: z.string().optional(),
   cursor: z.number('Cursor must be a number').int().nullish(),
   limit: z
      .number('Limit must be a number')
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(DEFAULT_PAGE_SIZE),
});

const getAllPublicProblems = publicProcedure
   .input(GetAllPublicProblemsSchema)
   .query(async ({ input }) => {
      const { cursor, limit } = input;
      const tagFilter =
         input.tids && input.tids.length > 0
            ? { tags: { some: { tid: { in: input.tids } } } }
            : {};
      const difficultyFilter = input.difficulty
         ? { difficulty: input.difficulty }
         : {};
      const keywordFilter = input.keyword
         ? { title: { contains: input.keyword, mode: 'insensitive' as const } }
         : {};
      const problems = await prisma.baseProblems.findMany({
         where: {
            CurrentProblem: {
               status: 'published',
               ...tagFilter,
               ...difficultyFilter,
               ...keywordFilter,
            },
         },
         // 多取一条用于判断是否还有下一页
         take: limit + 1,
         // 游标是上一页被 pop 出来的那一条，下一轮从它开始（包含它）
         cursor: cursor == null ? undefined : { id: cursor },
         orderBy: { id: 'asc' },
         select: {
            id: true,
            CurrentProblem: {
               select: {
                  pid: true,
                  title: true,
                  difficulty: true,
                  totalScore: true,
                  tags: {
                     select: {
                        name: true,
                        color: true,
                     },
                  },
                  JudgeStatus: {
                     select: {
                        totalCount: true,
                        passedCount: true,
                     },
                  },
                  CoverImage: {
                     select: {
                        name: true,
                        thumbhash: true,
                     },
                  },
                  ProblemDefaultCover: {
                     select: {
                        image: {
                           select: { name: true, thumbhash: true },
                        },
                     },
                  },
               },
            },
         },
      });
      // 若取到了 limit + 1 条，说明还有下一页，返回最后一条的 id 作为游标
      let nextCursor: number | null = null;
      if (problems.length > limit) {
         nextCursor = problems.pop()!.id;
      }

      const rawItems = problems.map((p) => {
         const passCount = p.CurrentProblem?.JudgeStatus?.passedCount ?? 0;
         const totalCount = p.CurrentProblem?.JudgeStatus?.totalCount ?? 0;
         const passRate = totalCount === 0 ? 0 : (passCount / totalCount) * 100;
         return {
            ...p.CurrentProblem,
            // 没有封面时必须返回 null，而不是字符串 'unknown'：
            // 前端会拼成 /api/static/unknown，该请求因无扩展名被 403，
            // 于是仍然是一张坏图；返回 null 才能让 StImage 走设计好的占位图标。
            imageName:
               p.CurrentProblem?.CoverImage?.name ||
               p.CurrentProblem?.ProblemDefaultCover[0].image?.name ||
               null,
            imageHash:
               p.CurrentProblem?.CoverImage?.thumbhash ||
               p.CurrentProblem?.ProblemDefaultCover[0].image?.thumbhash ||
               null,
            passRate,
            CoverImage: undefined,
            ProblemDefaultCover: undefined,
            JudgeStatus: undefined,
         };
      });

      // 在服务端把 thumbhash 解码为 data URL（带 Redis 缓存），
      // 这样 SSR 首帧就能直接拿到占位图，无需客户端再次解码。
      const imageThumbhashUrls = await renderThumbhashDataUrls(
         rawItems.map((item) => item.imageHash),
      );
      const items = rawItems.map((item, index) => ({
         ...item,
         imageThumbhashUrl: imageThumbhashUrls[index],
      }));

      return { items, nextCursor };
   });

export const problemRouter = router({
   listPublicProblems: getAllPublicProblems,
});
