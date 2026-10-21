import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import { searchQuerySchema, SearchType } from '../../schemas/search';
import prisma from '~~/lib/prisma';
import type {
   SearchResult,
   ProblemSearchResult,
   UserSearchResult,
   TagSearchResult,
   PageSectionSearchResult,
   DailyProblemSearchResult,
} from '~/types/search';
import { logger } from '~~/server/utils/logger';
import { TRPCError } from '@trpc/server';
import { pageSecions } from '../../configs';

// 综合搜索接口，支持题目、用户、标签和页面板块的搜索
const searchProcedure = protectedProcedure
   .input(searchQuerySchema)
   .query(async ({ input, ctx }) => {
      const { q, type, limit } = input;
      const searchQuery = q.trim().toLowerCase();

      const types: Set<SearchType> = new Set(type.split(',') as SearchType[]);
      const wants = (t: SearchType) => types.has('all') || types.has(t);

      // 搜索题目
      const searchProblems = async (): Promise<SearchResult[]> => {
         if (!wants('problem')) return [];

         const problems = await prisma.baseProblems.findMany({
            where: {
               CurrentProblem: {
                  OR: [
                     {
                        pid: isNaN(Number(searchQuery))
                           ? undefined
                           : Number(searchQuery),
                     },
                     {
                        title: {
                           contains: searchQuery,
                           mode: 'insensitive',
                        },
                     },
                  ],
               },
            },
            include: {
               CurrentProblem: {
                  include: {
                     tags: true,
                  },
               },
            },
            take: limit,
         });

         const problemResults: ProblemSearchResult[] = problems
            .filter((p) => p.CurrentProblem)
            .map((p) => ({
               id: `problem-${p.id}`,
               type: 'problem' as const,
               title: p.CurrentProblem!.title,
               description: p.CurrentProblem!.detail.substring(0, 100),
               url: `/challenge/${p.id}`,
               metadata: {
                  difficulty: p.CurrentProblem!.difficulty,
                  tags: p.CurrentProblem!.tags.map((t) => t.name),
                  solvedCount: 0, // TODO: 添加解决数统计
                  acceptRate: 0, // TODO: 添加通过率统计
               },
            }));

         return problemResults;
      };

      // 按标签搜索题目
      const searchTags = async (): Promise<SearchResult[]> => {
         if (!wants('tag')) return [];

         const tags = await prisma.tags.findMany({
            where: {
               name: {
                  contains: searchQuery,
                  mode: 'insensitive',
               },
            },
            include: {
               Problem: {
                  take: 5, // 每个标签最多显示5个题目
                  include: {
                     tags: true,
                  },
               },
            },
            take: limit,
         });

         const tagResults: SearchResult[] = tags.map(
            (tag): TagSearchResult => ({
               id: `tag-${tag.tid}`,
               type: 'tag' as const,
               title: tag.name,
               description:
                  tag.description || `包含 ${tag.Problem.length} 道题目`,
               url: `/app/problems?tag=${tag.tid}`,
               metadata: {
                  problemCount: tag.Problem.length,
                  color: tag.color || undefined,
               },
            }),
         );

         // 如果直接搜索标签，也把对应标签的题目加入结果
         if (type === 'tag') {
            for (const tag of tags) {
               const tagProblemResults: ProblemSearchResult[] = tag.Problem.map(
                  (problem) => ({
                     id: `problem-${problem.pid}`,
                     type: 'problem' as const,
                     title: problem.title,
                     description: problem.detail.substring(0, 100),
                     url: `/challenge/${problem.pid}`,
                     metadata: {
                        difficulty: problem.difficulty,
                        tags: problem.tags.map((t) => t.name),
                        solvedCount: 0,
                        acceptRate: 0,
                     },
                  }),
               );

               tagResults.push(...tagProblemResults);
            }
         }

         return tagResults;
      };

      // 搜索用户
      const searchUsers = async (): Promise<SearchResult[]> => {
         if (!wants('user')) return [];

         const users = await prisma.user.findMany({
            where: {
               OR: [
                  // 按 ID 搜索
                  {
                     id: searchQuery,
                  },
                  // 按用户名搜索
                  {
                     name: {
                        contains: searchQuery,
                        mode: 'insensitive',
                     },
                  },
                  // 按显示名称搜索
                  {
                     displayName: {
                        contains: searchQuery,
                        mode: 'insensitive',
                     },
                  },
               ],
            },
            include: {
               avatar: true,
               UserStatistic: true,
            },
            take: limit,
         });

         const userResults: UserSearchResult[] = users.map((user) => ({
            id: `user-${user.id}`,
            type: 'user' as const,
            title: user.displayName || user.name,
            description: `@${user.name}`,
            url: `/app/space/${user.name}`,
            metadata: {
               avatar: user.avatar?.name, // 使用 name 字段作为头像标识
               role: user.role,
               solvedProblems: user.UserStatistic?.passCount || 0,
            },
         }));

         return userResults;
      };

      // 搜索页面板块
      const searchPageSections = (): SearchResult[] => {
         if (!wants('page-section')) return [];

         const matchingSections = pageSecions.filter((section) =>
            section.keywords.some((keyword) =>
               keyword.toLowerCase().includes(searchQuery),
            ),
         );

         const sectionResults: PageSectionSearchResult[] = matchingSections.map(
            (section) => ({
               id: section.id,
               type: 'page-section' as const,
               title: `${section.pageName} - ${section.sectionName}`,
               description: `快速跳转到 ${section.sectionName}`,
               url: section.url,
               metadata: {
                  pageName: section.pageName,
                  sectionName: section.sectionName,
               },
            }),
         );

         return sectionResults;
      };

      // 搜索每日一题
      const searchDailyProblems = async (): Promise<SearchResult[]> => {
         if (!wants('daily-problem')) return [];

         const today = new Date();
         today.setHours(0, 0, 0, 0);

         // 构建搜索条件
         const dailyProblemWhere: any = {
            date: {
               gte: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000), // 最近30天
            },
            baseProblem: {
               CurrentProblem: {
                  OR: [
                     // 按题目标题搜索
                     {
                        title: {
                           contains: searchQuery,
                           mode: 'insensitive',
                        },
                     },
                     // 按题目详情搜索
                     {
                        detail: {
                           contains: searchQuery,
                           mode: 'insensitive',
                        },
                     },
                     // 按标签搜索
                     {
                        tags: {
                           some: {
                              name: {
                                 contains: searchQuery,
                                 mode: 'insensitive',
                              },
                           },
                        },
                     },
                  ],
               },
            },
         };

         const dailyProblems = await prisma.dailyProblem.findMany({
            where: dailyProblemWhere,
            include: {
               baseProblem: {
                  include: {
                     CurrentProblem: {
                        include: {
                           tags: true,
                        },
                     },
                  },
               },
            },
            orderBy: {
               date: 'desc',
            },
            take: 10,
         });

         const dailyResults: DailyProblemSearchResult[] = dailyProblems
            .filter((dp) => dp.baseProblem.CurrentProblem)
            .map((dp) => {
               const isToday = dp.date.toDateString() === today.toDateString();
               return {
                  id: `daily-${dp.id}`,
                  type: 'daily-problem' as const,
                  title: `${isToday ? '今日题目' : '每日一题'}：${
                     dp.baseProblem.CurrentProblem!.title
                  }`,
                  description: `${dp.date.toLocaleDateString(
                     'zh-CN',
                  )} - ${dp.baseProblem.CurrentProblem!.detail.substring(
                     0,
                     80,
                  )}`,
                  url: `/challenge/${dp.baseProblem.id}`,
                  metadata: {
                     date: dp.date.toISOString(),
                     difficulty: dp.baseProblem.CurrentProblem!.difficulty,
                     tags: dp.baseProblem.CurrentProblem!.tags.map(
                        (t) => t.name,
                     ),
                     isToday,
                  },
               };
            });

         return dailyResults;
      };

      try {
         // 各类搜索互不依赖，并行查询；结果仍按原先的类型顺序拼接
         const [problemResults, tagResults, userResults, dailyResults] =
            await Promise.all([
               searchProblems(),
               searchTags(),
               searchUsers(),
               searchDailyProblems(),
            ]);
         const results: SearchResult[] = [
            ...problemResults,
            ...tagResults,
            ...userResults,
            ...searchPageSections(),
            ...dailyResults,
         ];

         // 按相关性排序（简单实现：精确匹配优先）
         const sortedResults = results.sort((a, b) => {
            const aExactMatch = a.title.toLowerCase().includes(searchQuery);
            const bExactMatch = b.title.toLowerCase().includes(searchQuery);

            if (aExactMatch && !bExactMatch) return -1;
            if (!aExactMatch && bExactMatch) return 1;

            // 相同类型的放在一起
            if (a.type !== b.type) {
               const typeOrder = [
                  'daily-problem',
                  'problem',
                  'user',
                  'tag',
                  'page-section',
               ];
               return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
            }

            return 0;
         });

         // 限制总结果数量
         const finalResults = sortedResults.slice(0, limit);

         return {
            results: finalResults,
            total: finalResults.length,
            hasMore: sortedResults.length > limit,
         };
      } catch (error) {
         logger.error(
            { error },
            'Search query failed',
         );
         throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: '搜索查询失败，请稍后再试',
         });
      }
   });

export const searchRouter = router({
   search: searchProcedure,
});
