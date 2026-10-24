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
   AchievementSearchResult,
   NotificationSearchResult,
   SubmissionSearchResult,
   AppealSearchResult,
   CloudFunctionSearchResult,
} from '~/types/search';
import { logger } from '~~/server/utils/logger';
import { TRPCError } from '@trpc/server';
import { pageSecions } from '../../configs';
import { problemStatService } from '../../services/problem-stat';

/** 单个搜索类型的分页结果 */
interface TypePage {
   results: SearchResult[];
   hasMore: boolean;
}
const EMPTY_PAGE: TypePage = { results: [], hasMore: false };

// 综合搜索接口，支持题目、用户、标签和页面板块的搜索
const searchProcedure = protectedProcedure
   .input(searchQuerySchema)
   .query(async ({ input, ctx }) => {
      const { q, type, limit, offset } = input;
      const searchQuery = q.trim().toLowerCase();
      const role = ctx.user.role;
      const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

      const types: Set<SearchType> = new Set(type.split(',') as SearchType[]);
      const wants = (t: SearchType) => types.has('all') || types.has(t);

      // 搜索题目（仅搜索已发布的题目）
      const searchProblems = async (): Promise<TypePage> => {
         if (!wants('problem')) return EMPTY_PAGE;

         const problems = await prisma.baseProblems.findMany({
            where: {
               CurrentProblem: {
                  status: 'published',
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
            skip: offset,
            take: limit + 1,
         });

         const passRates = await problemStatService.getPassRates(
            problems.map((p) => p.id)
         );

         const problemResults: ProblemSearchResult[] = problems
            .filter((p) => p.CurrentProblem)
            .map((p) => ({
               id: `problem-${p.id}`,
               type: 'problem' as const,
               title: p.CurrentProblem!.title,
               description: p.CurrentProblem!.detail.substring(0, 100),
               url: `/challenge/editor/${p.CurrentProblem!.pid}`,
               metadata: {
                  difficulty: p.CurrentProblem!.difficulty,
                  tags: p.CurrentProblem!.tags.map((t) => t.name),
                  acceptRate: passRates.get(p.id) ?? 0,
               },
            }));

         return {
            results: problemResults,
            hasMore: problems.length > limit,
         };
      };

      // 按标签搜索题目
      const searchTags = async (): Promise<TypePage> => {
         if (!wants('tag')) return EMPTY_PAGE;

         const liveRows = await prisma.$queryRaw<{ tid: number; live: number }[]>`
            SELECT rel."B" AS tid, COUNT(DISTINCT b.id) AS live
            FROM "_ProblemsToTags" rel
            JOIN problems cp ON cp.pid = rel."A" AND cp.status = 'published'
            JOIN base_problems b ON b."currentPid" = rel."A"
            GROUP BY rel."B"
         `;
         const liveByTid = new Map(
            liveRows.map((row) => [Number(row.tid), Number(row.live)])
         );

         const tags = await prisma.tags.findMany({
            where: {
               name: {
                  contains: searchQuery,
                  mode: 'insensitive',
               },
               tid: { in: [...liveByTid.keys()] },
            },
            include: {
               Problem: {
                  take: 5, // 每个标签最多显示5个题目
                  include: {
                     tags: true,
                  },
               },
            },
            skip: offset,
            take: limit + 1,
         });

         const tagResults: SearchResult[] = tags.map(
            (tag): TagSearchResult => ({
               id: `tag-${tag.tid}`,
               type: 'tag' as const,
               title: tag.name,
               description:
                  tag.description ||
                  `包含 ${liveByTid.get(tag.tid) ?? 0} 道已发布题目`,
               url: `/app/problems?tag=${tag.tid}`,
               metadata: {
                  problemCount: liveByTid.get(tag.tid) ?? 0,
                  color: tag.color || undefined,
               },
            }),
         );

         // 如果直接搜索标签，也把对应标签的题目加入结果
         if (type === 'tag') {
            const tagProblemPassRates = await problemStatService.getPassRates(
               tags.flatMap((tag) => tag.Problem.map((p) => p.baseId))
            );
            for (const tag of tags) {
               const tagProblemResults: ProblemSearchResult[] = tag.Problem.map(
                  (problem) => ({
                     id: `problem-${problem.pid}`,
                     type: 'problem' as const,
                     title: problem.title,
                     description: problem.detail.substring(0, 100),
                     url: `/challenge/editor/${problem.pid}`,
                     metadata: {
                        difficulty: problem.difficulty,
                        tags: problem.tags.map((t) => t.name),
                        acceptRate: tagProblemPassRates.get(problem.baseId) ?? 0,
                     },
                  }),
               );

               tagResults.push(...tagProblemResults);
            }
         }

         return {
            results: tagResults,
            hasMore: tags.length > limit,
         };
      };

      // 搜索用户
      const searchUsers = async (): Promise<TypePage> => {
         if (!wants('user')) return EMPTY_PAGE;

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
            skip: offset,
            take: limit + 1,
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

         return {
            results: userResults,
            hasMore: users.length > limit,
         };
      };

      // 搜索页面板块
      const searchPageSections = (): TypePage => {
         if (!wants('page-section')) return EMPTY_PAGE;

         const matchingSections = pageSecions.filter(
            (section) =>
               // 管理类板块仅对管理员可见
               (!section.adminOnly || isAdmin) &&
               section.keywords.some((keyword) =>
                  keyword.toLowerCase().includes(searchQuery),
               ),
         );

         const pageSections = matchingSections.slice(offset, offset + limit);

         const sectionResults: PageSectionSearchResult[] = pageSections.map(
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

         return {
            results: sectionResults,
            hasMore: matchingSections.length > offset + limit,
         };
      };

      // 搜索每日一题
      const searchDailyProblems = async (): Promise<TypePage> => {
         if (!wants('daily-problem')) return EMPTY_PAGE;

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
            skip: offset,
            take: limit + 1,
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
                  url: `/challenge/editor/${dp.baseProblem.CurrentProblem!.pid}`,
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

         return {
            results: dailyResults,
            hasMore: dailyProblems.length > limit,
         };
      };

      // 搜索成就
      const searchAchievements = async (): Promise<TypePage> => {
         if (!wants('achievement')) return EMPTY_PAGE;

         const achievements = await prisma.achievement.findMany({
            where: {
               OR: [
                  {
                     name: {
                        contains: searchQuery,
                        mode: 'insensitive',
                     },
                  },
                  {
                     description: {
                        contains: searchQuery,
                        mode: 'insensitive',
                     },
                  },
               ],
            },
            include: {
               UserAchievement: {
                  where: { userId: ctx.user.userId },
                  take: 1,
               },
            },
            skip: offset,
            take: limit + 1,
         });

         const achievementResults: AchievementSearchResult[] =
            achievements.map((achievement) => ({
               id: `achievement-${achievement.id}`,
               type: 'achievement' as const,
               title: achievement.name,
               description:
                  achievement.description || `成就分数 ${achievement.score}`,
               url: '/app/achievements',
               metadata: {
                  score: achievement.score,
                  unlocked: achievement.UserAchievement.length > 0,
               },
            }));

         return {
            results: achievementResults,
            hasMore: achievements.length > limit,
         };
      };

      // 搜索当前用户的通知与公告
      const searchNotifications = async (): Promise<TypePage> => {
         if (!wants('notification')) return EMPTY_PAGE;

         const notifications = await prisma.notification.findMany({
            where: {
               userId: ctx.user.userId,
               OR: [
                  {
                     title: {
                        contains: searchQuery,
                        mode: 'insensitive',
                     },
                  },
                  {
                     content: {
                        contains: searchQuery,
                        mode: 'insensitive',
                     },
                  },
               ],
            },
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit + 1,
         });

         const notificationResults: NotificationSearchResult[] =
            notifications.map((notification) => ({
               id: `notification-${notification.id}`,
               type: 'notification' as const,
               title: notification.title,
               description: notification.content.substring(0, 100),
               url: '/app/notifications',
               metadata: {
                  notificationType: notification.type,
                  read: notification.read,
                  createdAt: notification.createdAt.toISOString(),
               },
            }));

         return {
            results: notificationResults,
            hasMore: notifications.length > limit,
         };
      };

      // 搜索提交记录（仅管理员）
      const searchSubmissions = async (): Promise<TypePage> => {
         if (!wants('submission') || !isAdmin) return EMPTY_PAGE;

         const submissions = await prisma.judgeRecords.findMany({
            where: {
               type: 'judge',
               OR: [
                  {
                     user: {
                        OR: [
                           {
                              name: {
                                 contains: searchQuery,
                                 mode: 'insensitive',
                              },
                           },
                           {
                              displayName: {
                                 contains: searchQuery,
                                 mode: 'insensitive',
                              },
                           },
                        ],
                     },
                  },
                  {
                     problem: {
                        title: {
                           contains: searchQuery,
                           mode: 'insensitive',
                        },
                     },
                  },
                  {
                     problemId: isNaN(Number(searchQuery))
                        ? undefined
                        : Number(searchQuery),
                  },
               ],
            },
            include: {
               user: { select: { name: true, displayName: true } },
               problem: { select: { pid: true, title: true } },
            },
            orderBy: { id: 'desc' },
            skip: offset,
            take: limit + 1,
         });

         const submissionResults: SubmissionSearchResult[] = submissions.map(
            (submission) => ({
               id: `submission-${submission.id}`,
               type: 'submission' as const,
               title: `#${submission.id} ${submission.problem.title}`,
               description: `@${
                  submission.user.displayName || submission.user.name
               } 的提交`,
               url: '/app/manage/submission',
               metadata: {
                  result: submission.result,
                  score: submission.score,
                  userName: submission.user.displayName || submission.user.name,
                  problemTitle: submission.problem.title,
                  createdAt: submission.createdAt.toISOString(),
               },
            })
         );

         return {
            results: submissionResults,
            hasMore: submissions.length > limit,
         };
      };

      // 搜索用户申诉（仅管理员）
      const searchAppeals = async (): Promise<TypePage> => {
         if (!wants('appeal') || !isAdmin) return EMPTY_PAGE;

         const appeals = await prisma.appeal.findMany({
            where: {
               OR: [
                  {
                     content: {
                        contains: searchQuery,
                        mode: 'insensitive',
                     },
                  },
                  {
                     user: {
                        OR: [
                           {
                              name: {
                                 contains: searchQuery,
                                 mode: 'insensitive',
                              },
                           },
                           {
                              displayName: {
                                 contains: searchQuery,
                                 mode: 'insensitive',
                              },
                           },
                        ],
                     },
                  },
               ],
            },
            include: {
               user: { select: { name: true, displayName: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit + 1,
         });

         const appealResults: AppealSearchResult[] = appeals.map((appeal) => ({
            id: `appeal-${appeal.id}`,
            type: 'appeal' as const,
            title: appeal.user.displayName || appeal.user.name,
            description: appeal.content.substring(0, 100),
            url: '/app/manage/appeal',
            metadata: {
               status: appeal.status,
               userName: appeal.user.displayName || appeal.user.name,
               createdAt: appeal.createdAt.toISOString(),
            },
         }));

         return {
            results: appealResults,
            hasMore: appeals.length > limit,
         };
      };

      // 搜索云函数（仅管理员）
      const searchCloudFunctions = async (): Promise<TypePage> => {
         if (!wants('cloud-function') || !isAdmin) return EMPTY_PAGE;

         const cloudFunctions = await prisma.cloudFunction.findMany({
            where: {
               OR: [
                  {
                     name: {
                        contains: searchQuery,
                        mode: 'insensitive',
                     },
                  },
                  {
                     description: {
                        contains: searchQuery,
                        mode: 'insensitive',
                     },
                  },
               ],
            },
            orderBy: { updatedAt: 'desc' },
            skip: offset,
            take: limit + 1,
         });

         const cloudFunctionResults: CloudFunctionSearchResult[] =
            cloudFunctions.map((fn) => ({
               id: `cloud-function-${fn.id}`,
               type: 'cloud-function' as const,
               title: fn.name,
               description: fn.description || '暂无描述',
               url: '/app/manage/cloud-function',
               metadata: {
                  enabled: fn.enabled,
               },
            }));

         return {
            results: cloudFunctionResults,
            hasMore: cloudFunctions.length > limit,
         };
      };

      try {
         // 各类搜索互不依赖，并行查询；结果仍按原先的类型顺序拼接
         const [problemPage, tagPage, userPage, dailyPage, achievementPage, notificationPage, submissionPage, appealPage, cloudFunctionPage] =
            await Promise.all([
               searchProblems(),
               searchTags(),
               searchUsers(),
               searchDailyProblems(),
               searchAchievements(),
               searchNotifications(),
               searchSubmissions(),
               searchAppeals(),
               searchCloudFunctions(),
            ]);
         const sectionPage = searchPageSections();

         const results: SearchResult[] = [
            ...problemPage.results,
            ...tagPage.results,
            ...userPage.results,
            ...achievementPage.results,
            ...notificationPage.results,
            ...submissionPage.results,
            ...appealPage.results,
            ...cloudFunctionPage.results,
            ...sectionPage.results,
            ...dailyPage.results,
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
                  'achievement',
                  'notification',
                  'user',
                  'tag',
                  'submission',
                  'appeal',
                  'cloud-function',
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
            hasMore:
               problemPage.hasMore ||
               tagPage.hasMore ||
               userPage.hasMore ||
               achievementPage.hasMore ||
               notificationPage.hasMore ||
               submissionPage.hasMore ||
               appealPage.hasMore ||
               cloudFunctionPage.hasMore ||
               sectionPage.hasMore ||
               dailyPage.hasMore,
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
