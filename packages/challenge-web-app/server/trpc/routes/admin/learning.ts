import { TRPCError } from '@trpc/server';
import z from 'zod';
import prisma from '~~/lib/prisma';
import { parseLearningArticleDirectives } from '../../../utils/learning-directives';
import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';

const LearningIdSchema = z.union([z.string().uuid(), z.string().cuid()]);
const IdSchema = z.object({ id: LearningIdSchema });
const PlaygroundIdSchema = z.union([z.string().cuid(), z.string().uuid()]);
const PlaygroundSchema = z.object({
   id: PlaygroundIdSchema.optional(),
   title: z.string().trim().min(1).max(100).default('动手试一试'),
   html: z.string().default(''),
   css: z.string().default(''),
   js: z.string().default(''),
});
const ArticleFieldsSchema = z.object({
   title: z.string().trim().min(1).max(200),
   summary: z.string().max(1000).default(''),
   source: z.string().default(''),
   coverImageId: z.string().cuid().nullable().optional(),
   playgrounds: z.array(PlaygroundSchema).default([]),
});
const CreateArticleSchema = ArticleFieldsSchema;
const UpdateArticleSchema = ArticleFieldsSchema.partial()
   .extend({ id: LearningIdSchema })
   .refine(
      ({ id: _id, ...fields }) => Object.values(fields).some((value) => value !== undefined),
      '至少需要更新一个字段',
   );

function badRequest(message: string): never {
   throw new TRPCError({ code: 'BAD_REQUEST', message });
}

async function validatePublishedProblems(baseIds: number[]) {
   const uniqueIds = [...new Set(baseIds)];
   const problems = await prisma.baseProblems.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, CurrentProblem: { select: { status: true } } },
   });
   const validIds = new Set(
      problems
         .filter((problem) => problem.CurrentProblem?.status === 'published')
         .map((problem) => problem.id),
   );
   const invalidIds = uniqueIds.filter((id) => !validIds.has(id));
   if (invalidIds.length > 0) {
      badRequest(
         `题目不存在、没有 current 版本或 current 版本未发布：${invalidIds.join(', ')}`,
      );
   }
}

function validatePlaygroundDirectives(source: string, playgroundIds: Iterable<string>) {
   const configuredIds = new Set(playgroundIds);
   const missingIds = parseLearningArticleDirectives(source).playgrounds
      .map((item) => item.id)
      .filter((id) => !configuredIds.has(id));
   if (missingIds.length > 0) {
      badRequest(`文章引用了未配置的 Playground：${missingIds.join(', ')}`);
   }
}

const articleDetailSelect = {
   id: true,
   title: true,
   summary: true,
   source: true,
   status: true,
   coverImageId: true,
   publishedAt: true,
   createdAt: true,
   updatedAt: true,
   author: { select: { id: true, name: true, displayName: true } },
   problems: {
      orderBy: { sort: 'asc' as const },
      select: {
         baseId: true,
         sort: true,
         baseProblem: {
            select: {
               CurrentProblem: {
                  select: { pid: true, title: true, status: true, totalScore: true },
               },
            },
         },
      },
   },
   playgrounds: {
      orderBy: { createdAt: 'asc' as const },
      select: { id: true, title: true, html: true, css: true, js: true },
   },
};

const listArticles = protectedAdminProcedure.query(async () =>
   prisma.learningArticle.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
         id: true,
         title: true,
         summary: true,
         status: true,
         coverImageId: true,
         publishedAt: true,
         createdAt: true,
         updatedAt: true,
         author: { select: { id: true, name: true, displayName: true } },
         _count: { select: { topics: true, problems: true, playgrounds: true } },
      },
   }),
);

const getArticle = protectedAdminProcedure
   .input(IdSchema)
   .query(async ({ input }) => {
      const article = await prisma.learningArticle.findUnique({
         where: { id: input.id },
         select: articleDetailSelect,
      });
      if (!article) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '文章不存在' });
      }
      return article;
   });

const createArticle = protectedAdminProcedure
   .input(CreateArticleSchema)
   .mutation(async ({ ctx, input }) => {
      const directives = parseLearningArticleDirectives(input.source);
      await validatePublishedProblems(directives.problems.map((item) => item.baseId));

      const suppliedIds = input.playgrounds.flatMap((item) => (item.id ? [item.id] : []));
      if (new Set(suppliedIds).size !== suppliedIds.length) {
         badRequest('Playground id 不能重复');
      }
      validatePlaygroundDirectives(input.source, suppliedIds);

      return prisma.$transaction(async (tx) => {
         const article = await tx.learningArticle.create({
            data: {
               authorId: ctx.user.userId,
               title: input.title,
               summary: input.summary,
               source: input.source,
               coverImageId: input.coverImageId,
            },
         });
         if (directives.problems.length > 0) {
            await tx.learningArticleProblem.createMany({
               data: directives.problems.map((item) => ({
                  articleId: article.id,
                  baseId: item.baseId,
                  sort: item.sort,
               })),
            });
         }
         for (const playground of input.playgrounds) {
            await tx.learningPlayground.create({
               data: { ...playground, articleId: article.id },
            });
         }
         return tx.learningArticle.findUniqueOrThrow({
            where: { id: article.id },
            select: articleDetailSelect,
         });
      });
   });

const updateArticle = protectedAdminProcedure
   .input(UpdateArticleSchema)
   .mutation(async ({ input }) => {
      const existing = await prisma.learningArticle.findUnique({
         where: { id: input.id },
         select: {
            source: true,
            playgrounds: { select: { id: true } },
         },
      });
      if (!existing) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '文章不存在' });
      }

      const source = input.source ?? existing.source;
      const directives = parseLearningArticleDirectives(source);
      await validatePublishedProblems(directives.problems.map((item) => item.baseId));

      const playgroundIds =
         input.playgrounds?.flatMap((item) => (item.id ? [item.id] : [])) ??
         existing.playgrounds.map((item) => item.id);
      if (new Set(playgroundIds).size !== playgroundIds.length) {
         badRequest('Playground id 不能重复');
      }
      validatePlaygroundDirectives(source, playgroundIds);

      return prisma.$transaction(async (tx) => {
         const { id, playgrounds, ...fields } = input;
         await tx.learningArticle.update({ where: { id }, data: fields });
         await tx.learningArticleProblem.deleteMany({ where: { articleId: id } });
         if (directives.problems.length > 0) {
            await tx.learningArticleProblem.createMany({
               data: directives.problems.map((item) => ({
                  articleId: id,
                  baseId: item.baseId,
                  sort: item.sort,
               })),
            });
         }

         if (playgrounds !== undefined) {
            const existingIds = new Set(existing.playgrounds.map((item) => item.id));
            const providedIds = playgrounds.flatMap((item) =>
               item.id ? [item.id] : [],
            );
            const foreignIds = providedIds.filter(
               (itemId) => !existingIds.has(itemId) && !z.string().uuid().safeParse(itemId).success,
            );
            if (foreignIds.length > 0) {
               badRequest(`Playground 不属于当前文章：${foreignIds.join(', ')}`);
            }
            await tx.learningPlayground.deleteMany({
               where: { articleId: id, id: { notIn: providedIds } },
            });
            for (const playground of playgrounds) {
               const { id: playgroundId, ...data } = playground;
               if (playgroundId && existingIds.has(playgroundId)) {
                  await tx.learningPlayground.update({
                     where: { id: playgroundId },
                     data,
                  });
               } else {
                  await tx.learningPlayground.create({
                     data: { ...data, id: playgroundId, articleId: id },
                  });
               }
            }
         }

         return tx.learningArticle.findUniqueOrThrow({
            where: { id },
            select: articleDetailSelect,
         });
      });
   });

const publishArticle = protectedAdminProcedure
   .input(IdSchema)
   .mutation(async ({ input }) => {
      const article = await prisma.learningArticle.findUnique({
         where: { id: input.id },
         select: {
            source: true,
            problems: { select: { baseId: true } },
            playgrounds: { select: { id: true } },
         },
      });
      if (!article) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '文章不存在' });
      }
      await validatePublishedProblems(article.problems.map((item) => item.baseId));
      validatePlaygroundDirectives(
         article.source,
         article.playgrounds.map((item) => item.id),
      );
      return prisma.learningArticle.update({
         where: { id: input.id },
         data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
   });

const unpublishArticle = protectedAdminProcedure
   .input(IdSchema)
   .mutation(async ({ input }) => {
      const publishedTopicCount = await prisma.learningTopicArticle.count({
         where: {
            articleId: input.id,
            topic: { status: 'PUBLISHED' },
         },
      });
      if (publishedTopicCount > 0) {
         badRequest('文章正被已发布专题引用，请先下架相关专题');
      }
      return prisma.learningArticle.update({
         where: { id: input.id },
         data: { status: 'DRAFT', publishedAt: null },
      });
   });

const deleteArticle = protectedAdminProcedure
   .input(IdSchema)
   .mutation(({ input }) =>
      prisma.learningArticle.delete({ where: { id: input.id } }),
   );

const TopicItemSchema = z.discriminatedUnion('type', [
   z.object({ type: z.literal('article'), articleId: LearningIdSchema }),
   z.object({ type: z.literal('problem'), baseId: z.number().int().positive() }),
]);
const TopicFieldsSchema = z.object({
   title: z.string().trim().min(1).max(200),
   description: z.string().max(2000).default(''),
   items: z.array(TopicItemSchema).default([]),
});
const UpdateTopicSchema = TopicFieldsSchema.partial()
   .extend({ id: LearningIdSchema })
   .refine(
      ({ id: _id, ...fields }) => Object.values(fields).some((value) => value !== undefined),
      '至少需要更新一个字段',
   );

function validateUniqueTopicItems(items: z.infer<typeof TopicItemSchema>[]) {
   const keys = items.map((item) =>
      item.type === 'article' ? `article:${item.articleId}` : `problem:${item.baseId}`,
   );
   if (new Set(keys).size !== keys.length) {
      badRequest('专题 items 不能包含重复引用');
   }
}

async function validateTopicItems(
   items: z.infer<typeof TopicItemSchema>[],
   requirePublished: boolean,
) {
   validateUniqueTopicItems(items);
   const articleIds = items.flatMap((item) =>
      item.type === 'article' ? [item.articleId] : [],
   );
   const baseIds = items.flatMap((item) => (item.type === 'problem' ? [item.baseId] : []));
   const [articles, problems] = await Promise.all([
      prisma.learningArticle.findMany({
         where: { id: { in: articleIds } },
         select: {
            id: true,
            status: true,
            problems: { select: { baseId: true } },
         },
      }),
      prisma.baseProblems.findMany({
         where: { id: { in: baseIds } },
         select: { id: true, CurrentProblem: { select: { status: true } } },
      }),
   ]);
   if (articles.length !== articleIds.length || problems.length !== baseIds.length) {
      badRequest('专题包含不存在的文章或题目');
   }
   if (requirePublished) {
      const unpublishedArticles = articles.filter(
         (article) => article.status !== 'PUBLISHED',
      );
      if (unpublishedArticles.length > 0) {
         badRequest(
            `专题包含未发布文章：${unpublishedArticles.map((item) => item.id).join(', ')}`,
         );
      }
      await validatePublishedProblems([
         ...baseIds,
         ...articles.flatMap((article) =>
            article.problems.map((problem) => problem.baseId),
         ),
      ]);
   }
}

async function getTopicItems(id: string) {
   const topic = await prisma.learningTopic.findUnique({
      where: { id },
      select: {
         id: true,
         title: true,
         description: true,
         status: true,
         publishedAt: true,
         createdAt: true,
         updatedAt: true,
         author: { select: { id: true, name: true, displayName: true } },
         articles: {
            select: {
               articleId: true,
               sort: true,
               article: { select: { title: true, status: true } },
            },
         },
         problems: {
            select: {
               baseId: true,
               sort: true,
               baseProblem: {
                  select: {
                     CurrentProblem: {
                        select: { pid: true, title: true, status: true },
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
   const { articles, problems, ...fields } = topic;
   const items = [
      ...articles.map((item) => ({
         type: 'article' as const,
         articleId: item.articleId,
         sort: item.sort,
         title: item.article.title,
         status: item.article.status,
      })),
      ...problems.map((item) => ({
         type: 'problem' as const,
         baseId: item.baseId,
         sort: item.sort,
         title: item.baseProblem.CurrentProblem?.title ?? null,
         problemId: item.baseProblem.CurrentProblem?.pid ?? null,
         status: item.baseProblem.CurrentProblem?.status ?? null,
      })),
   ].sort((a, b) => a.sort - b.sort);
   return { ...fields, items };
}

const listTopics = protectedAdminProcedure.query(() =>
   prisma.learningTopic.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
         id: true,
         title: true,
         description: true,
         status: true,
         publishedAt: true,
         createdAt: true,
         updatedAt: true,
         author: { select: { id: true, name: true, displayName: true } },
         _count: { select: { articles: true, problems: true, visits: true } },
      },
   }),
);

const getTopic = protectedAdminProcedure
   .input(IdSchema)
   .query(({ input }) => getTopicItems(input.id));

const createTopic = protectedAdminProcedure
   .input(TopicFieldsSchema)
   .mutation(async ({ ctx, input }) => {
      await validateTopicItems(input.items, false);
      const topic = await prisma.$transaction(async (tx) => {
         const created = await tx.learningTopic.create({
            data: {
               authorId: ctx.user.userId,
               title: input.title,
               description: input.description,
            },
         });
         const articles = input.items.flatMap((item, sort) =>
            item.type === 'article'
               ? [{ topicId: created.id, articleId: item.articleId, sort }]
               : [],
         );
         const problems = input.items.flatMap((item, sort) =>
            item.type === 'problem'
               ? [{ topicId: created.id, baseId: item.baseId, sort }]
               : [],
         );
         if (articles.length > 0) {
            await tx.learningTopicArticle.createMany({ data: articles });
         }
         if (problems.length > 0) {
            await tx.learningTopicProblem.createMany({ data: problems });
         }
         return created;
      });
      return getTopicItems(topic.id);
   });

const updateTopic = protectedAdminProcedure
   .input(UpdateTopicSchema)
   .mutation(async ({ input }) => {
      const existing = await prisma.learningTopic.findUnique({
         where: { id: input.id },
         select: { id: true, status: true },
      });
      if (!existing) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '专题不存在' });
      }
      if (input.items) {
         await validateTopicItems(input.items, existing.status === 'PUBLISHED');
      }
      await prisma.$transaction(async (tx) => {
         const { id, items, ...fields } = input;
         await tx.learningTopic.update({ where: { id }, data: fields });
         if (items) {
            await Promise.all([
               tx.learningTopicArticle.deleteMany({ where: { topicId: id } }),
               tx.learningTopicProblem.deleteMany({ where: { topicId: id } }),
            ]);
            const articles = items.flatMap((item, sort) =>
               item.type === 'article'
                  ? [{ topicId: id, articleId: item.articleId, sort }]
                  : [],
            );
            const problems = items.flatMap((item, sort) =>
               item.type === 'problem'
                  ? [{ topicId: id, baseId: item.baseId, sort }]
                  : [],
            );
            if (articles.length > 0) {
               await tx.learningTopicArticle.createMany({ data: articles });
            }
            if (problems.length > 0) {
               await tx.learningTopicProblem.createMany({ data: problems });
            }
         }
      });
      return getTopicItems(input.id);
   });

const publishTopic = protectedAdminProcedure
   .input(IdSchema)
   .mutation(async ({ input }) => {
      const topic = await getTopicItems(input.id);
      const items = topic.items.map((item) =>
         item.type === 'article'
            ? { type: 'article' as const, articleId: item.articleId }
            : { type: 'problem' as const, baseId: item.baseId },
      );
      await validateTopicItems(items, true);
      return prisma.learningTopic.update({
         where: { id: input.id },
         data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
   });

const unpublishTopic = protectedAdminProcedure
   .input(IdSchema)
   .mutation(({ input }) =>
      prisma.learningTopic.update({
         where: { id: input.id },
         data: { status: 'DRAFT', publishedAt: null },
      }),
   );

const deleteTopic = protectedAdminProcedure
   .input(IdSchema)
   .mutation(({ input }) => prisma.learningTopic.delete({ where: { id: input.id } }));

export const learningAdminRouter = router({
   listArticles,
   getArticle,
   createArticle,
   updateArticle,
   publishArticle,
   unpublishArticle,
   deleteArticle,
   listTopics,
   getTopic,
   createTopic,
   updateTopic,
   publishTopic,
   unpublishTopic,
   deleteTopic,
});
