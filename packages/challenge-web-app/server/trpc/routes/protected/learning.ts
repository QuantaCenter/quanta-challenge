import { TRPCError } from '@trpc/server';
import z from 'zod';
import prisma from '~~/lib/prisma';
import { protectedProcedure } from '../../protected-trpc';
import {
   getArticleLearningProgress,
   getCompletedLearningProblemIds,
   getTopicLearningProgress,
} from '../../services/learning';
import { router } from '../../trpc';

const IdSchema = z.object({
   id: z.union([z.string().uuid(), z.string().cuid()]),
});

const listTopics = protectedProcedure.query(async ({ ctx }) => {
   const topics = await prisma.learningTopic.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
         id: true,
         title: true,
         description: true,
         publishedAt: true,
         _count: { select: { articles: true, problems: true } },
      },
   });
   const progress = await Promise.all(
      topics.map((topic) => getTopicLearningProgress(ctx.user.userId, topic.id)),
   );
   return topics.map((topic, index) => ({ ...topic, ...progress[index] }));
});

const listArticles = protectedProcedure.query(async ({ ctx }) => {
   const articles = await prisma.learningArticle.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
         id: true,
         title: true,
         summary: true,
         publishedAt: true,
         createdAt: true,
         coverImage: { select: { name: true } },
         author: {
            select: {
               name: true,
               displayName: true,
               avatar: { select: { name: true } },
            },
         },
         problems: {
            where: {
               baseProblem: {
                  CurrentProblem: { is: { status: 'published' } },
               },
            },
            select: { baseId: true },
         },
      },
   });

   const progress = await Promise.all(
      articles.map((article) =>
         getArticleLearningProgress(
            ctx.user.userId,
            article.id,
            article.problems.map((problem) => problem.baseId),
         ),
      ),
   );

   return articles.map((article, index) => {
      const { completedProblemIds: _completedProblemIds, ...progressFields } =
         progress[index]!;
      return {
         id: article.id,
         title: article.title,
         summary: article.summary,
         publishedAt: article.publishedAt ?? article.createdAt,
         coverImageName: article.coverImage?.name ?? null,
         authorName: article.author.displayName || article.author.name,
         authorAvatarName: article.author.avatar?.name ?? null,
         problemCount: article.problems.length,
         ...progressFields,
      };
   });
});

const getTopic = protectedProcedure
   .input(IdSchema)
   .query(async ({ ctx, input }) => {
      const topic = await prisma.learningTopic.findFirst({
         where: { id: input.id, status: 'PUBLISHED' },
         select: {
            id: true,
            title: true,
            description: true,
            publishedAt: true,
            articles: {
               where: { article: { status: 'PUBLISHED' } },
               select: {
                  articleId: true,
                  sort: true,
                  article: {
                     select: {
                        title: true,
                        summary: true,
                        coverImageId: true,
                        publishedAt: true,
                        coverImage: { select: { name: true } },
                        author: {
                           select: {
                              name: true,
                              displayName: true,
                              avatar: { select: { name: true } },
                           },
                        },
                        problems: {
                           where: {
                              baseProblem: {
                                 CurrentProblem: {
                                    is: { status: 'published' },
                                 },
                              },
                           },
                           select: { baseId: true },
                        },
                     },
                  },
               },
            },
            problems: {
               where: {
                  baseProblem: {
                     CurrentProblem: { is: { status: 'published' } },
                  },
               },
               select: {
                  baseId: true,
                  sort: true,
                  baseProblem: {
                     select: {
                        CurrentProblem: {
                           select: {
                              pid: true,
                              title: true,
                              difficulty: true,
                              totalScore: true,
                              tags: {
                                 select: { name: true, color: true },
                              },
                              CoverImage: {
                                 select: { name: true, thumbhash: true },
                              },
                              ProblemDefaultCover: {
                                 take: 1,
                                 select: {
                                    image: {
                                       select: { name: true, thumbhash: true },
                                    },
                                 },
                              },
                           },
                        },
                     },
                  },
               },
            },
         },
      });
      if (!topic) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '专题不存在' });
      }

      const articleIds = topic.articles.map((item) => item.articleId);
      const allBaseIds = new Set(topic.problems.map((item) => item.baseId));
      for (const item of topic.articles) {
         for (const problem of item.article.problems) {
            allBaseIds.add(problem.baseId);
         }
      }
      const [reads, completedProblemIds, progress] = await Promise.all([
         prisma.learningArticleRead.findMany({
            where: {
               userId: ctx.user.userId,
               articleId: { in: articleIds },
            },
            select: { articleId: true, readAt: true },
         }),
         getCompletedLearningProblemIds(ctx.user.userId, allBaseIds),
         getTopicLearningProgress(ctx.user.userId, topic.id),
      ]);
      const readByArticle = new Map(reads.map((item) => [item.articleId, item.readAt]));
      const items = [
         ...topic.articles.map((item) => {
            const articleBaseIds = [
               ...new Set(item.article.problems.map((problem) => problem.baseId)),
            ];
            const completedProblems = articleBaseIds.filter((baseId) =>
               completedProblemIds.has(baseId),
            ).length;
            const isRead = readByArticle.has(item.articleId);
            const totalCount = 1 + articleBaseIds.length;
            const completedCount = (isRead ? 1 : 0) + completedProblems;
            return {
               type: 'article' as const,
               articleId: item.articleId,
               sort: item.sort,
               title: item.article.title,
               summary: item.article.summary,
               coverImageId: item.article.coverImageId,
               coverImageName: item.article.coverImage?.name ?? null,
               publishedAt: item.article.publishedAt,
               authorName:
                  item.article.author.displayName || item.article.author.name,
               authorAvatarName: item.article.author.avatar?.name ?? null,
               problemCount: articleBaseIds.length,
               isRead,
               readAt: readByArticle.get(item.articleId) ?? null,
               percent: Math.round((completedCount / totalCount) * 100),
               completed: completedCount === totalCount,
            };
         }),
         ...topic.problems.map((item) => ({
            type: 'problem' as const,
            baseId: item.baseId,
            problemId: item.baseProblem.CurrentProblem?.pid ?? null,
            sort: item.sort,
            title: item.baseProblem.CurrentProblem?.title ?? null,
            difficulty: item.baseProblem.CurrentProblem?.difficulty ?? null,
            totalScore: item.baseProblem.CurrentProblem?.totalScore ?? null,
            tags: item.baseProblem.CurrentProblem?.tags ?? [],
            coverImageName:
               item.baseProblem.CurrentProblem?.CoverImage?.name ??
               item.baseProblem.CurrentProblem?.ProblemDefaultCover[0]?.image
                  .name ??
               null,
            coverImageThumbhash:
               item.baseProblem.CurrentProblem?.CoverImage?.thumbhash ??
               item.baseProblem.CurrentProblem?.ProblemDefaultCover[0]?.image
                  .thumbhash ??
               null,
            completed: completedProblemIds.has(item.baseId),
         })),
      ].sort((a, b) => a.sort - b.sort);

      return {
         id: topic.id,
         title: topic.title,
         description: topic.description,
         publishedAt: topic.publishedAt,
         items,
         ...progress,
      };
   });

const getArticle = protectedProcedure
   .input(IdSchema)
   .query(async ({ ctx, input }) => {
      const article = await prisma.learningArticle.findFirst({
         where: { id: input.id, status: 'PUBLISHED' },
         select: {
            id: true,
            title: true,
            summary: true,
            source: true,
            coverImageId: true,
            publishedAt: true,
            coverImage: { select: { name: true } },
            author: {
               select: {
                  name: true,
                  displayName: true,
                  avatar: { select: { name: true } },
               },
            },
            topics: {
               where: { topic: { status: 'PUBLISHED' } },
               orderBy: { sort: 'asc' },
               select: {
                  topic: { select: { id: true, title: true } },
               },
            },
            playgrounds: {
               orderBy: { createdAt: 'asc' },
               select: { id: true, title: true, html: true, css: true, js: true },
            },
            problems: {
               where: {
                  baseProblem: {
                     CurrentProblem: { is: { status: 'published' } },
                  },
               },
               orderBy: { sort: 'asc' },
               select: {
                  baseId: true,
                  sort: true,
                  baseProblem: {
                     select: {
                        CurrentProblem: {
                           select: {
                              pid: true,
                              title: true,
                              difficulty: true,
                              totalScore: true,
                              tags: {
                                 select: { name: true, color: true },
                              },
                              CoverImage: {
                                 select: { name: true, thumbhash: true },
                              },
                              ProblemDefaultCover: {
                                 take: 1,
                                 select: {
                                    image: {
                                       select: { name: true, thumbhash: true },
                                    },
                                 },
                              },
                           },
                        },
                     },
                  },
               },
            },
         },
      });
      if (!article) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '文章不存在' });
      }

      const progress = await getArticleLearningProgress(
         ctx.user.userId,
         article.id,
         article.problems.map((item) => item.baseId),
      );
      const { completedProblemIds, ...progressFields } = progress;
      return {
         ...article,
         authorName: article.author.displayName || article.author.name,
         authorAvatarName: article.author.avatar?.name ?? null,
         coverImageName: article.coverImage?.name ?? null,
         publishedTopics: article.topics.map(({ topic }) => topic),
         problems: article.problems.map((item) => ({
            baseId: item.baseId,
            sort: item.sort,
            problemId: item.baseProblem.CurrentProblem?.pid ?? null,
            title: item.baseProblem.CurrentProblem?.title ?? null,
            difficulty: item.baseProblem.CurrentProblem?.difficulty ?? null,
            totalScore: item.baseProblem.CurrentProblem?.totalScore ?? null,
            tags: item.baseProblem.CurrentProblem?.tags ?? [],
            coverImageName:
               item.baseProblem.CurrentProblem?.CoverImage?.name ??
               item.baseProblem.CurrentProblem?.ProblemDefaultCover[0]?.image
                  .name ??
               null,
            coverImageThumbhash:
               item.baseProblem.CurrentProblem?.CoverImage?.thumbhash ??
               item.baseProblem.CurrentProblem?.ProblemDefaultCover[0]?.image
                  .thumbhash ??
               null,
            completed: completedProblemIds.has(item.baseId),
         })),
         ...progressFields,
      };
   });

const markRead = protectedProcedure
   .input(IdSchema)
   .mutation(async ({ ctx, input }) => {
      const article = await prisma.learningArticle.findFirst({
         where: { id: input.id, status: 'PUBLISHED' },
         select: { id: true },
      });
      if (!article) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '文章不存在' });
      }
      return prisma.learningArticleRead.upsert({
         where: {
            userId_articleId: {
               userId: ctx.user.userId,
               articleId: input.id,
            },
         },
         create: { userId: ctx.user.userId, articleId: input.id },
         update: { readAt: new Date() },
         select: { readAt: true },
      });
   });

const recordVisit = protectedProcedure
   .input(IdSchema)
   .mutation(async ({ ctx, input }) => {
      const topic = await prisma.learningTopic.findFirst({
         where: { id: input.id, status: 'PUBLISHED' },
         select: { id: true },
      });
      if (!topic) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '专题不存在' });
      }
      return prisma.learningTopicVisit.upsert({
         where: {
            userId_topicId: {
               userId: ctx.user.userId,
               topicId: input.id,
            },
         },
         create: { userId: ctx.user.userId, topicId: input.id },
         update: { visitedAt: new Date() },
         select: { visitedAt: true },
      });
   });

export const learningRouter = router({
   listTopics,
   listArticles,
   getTopic,
   getArticle,
   markRead,
   recordVisit,
});
