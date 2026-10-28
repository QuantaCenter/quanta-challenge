import prisma from '~~/lib/prisma';
import { calculateLearningProgress } from '../../utils/learning-progress';

export async function getCompletedLearningProblemIds(
   userId: string,
   baseIds: Iterable<number>,
) {
   const requestedIds = [...new Set(baseIds)];
   if (requestedIds.length === 0) {
      return new Set<number>();
   }

   const records = await prisma.judgeRecords.findMany({
      where: {
         userId,
         type: 'judge',
         result: 'success',
         problem: { baseId: { in: requestedIds } },
      },
      select: {
         score: true,
         problem: { select: { baseId: true, totalScore: true } },
      },
   });

   return new Set(
      records
         .filter((record) => record.score >= record.problem.totalScore)
         .map((record) => record.problem.baseId),
   );
}

export async function getArticleLearningProgress(
   userId: string,
   articleId: string,
   baseIds: Iterable<number>,
) {
   const uniqueBaseIds = [...new Set(baseIds)];
   const [read, completedProblemIds] = await Promise.all([
      prisma.learningArticleRead.findUnique({
         where: { userId_articleId: { userId, articleId } },
         select: { readAt: true },
      }),
      getCompletedLearningProblemIds(userId, uniqueBaseIds),
   ]);

   return {
      isRead: !!read,
      readAt: read?.readAt ?? null,
      completedProblemIds,
      ...calculateLearningProgress(
         (read ? 1 : 0) + completedProblemIds.size,
         1 + uniqueBaseIds.length,
      ),
   };
}

export async function getTopicLearningProgress(
   userId: string,
   topicId: string,
) {
   const topic = await prisma.learningTopic.findUnique({
      where: { id: topicId },
      select: {
         articles: {
            where: { article: { status: 'PUBLISHED' } },
            select: {
               articleId: true,
               article: {
                  select: {
                     problems: {
                        where: {
                           baseProblem: {
                              CurrentProblem: { is: { status: 'published' } },
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
            select: { baseId: true },
         },
      },
   });

   if (!topic) {
      return calculateLearningProgress(0, 0);
   }

   const articleIds = topic.articles.map((item) => item.articleId);
   const baseIds = new Set(topic.problems.map((item) => item.baseId));
   for (const item of topic.articles) {
      for (const problem of item.article.problems) {
         baseIds.add(problem.baseId);
      }
   }

   const [readCount, completedProblemIds] = await Promise.all([
      prisma.learningArticleRead.count({
         where: { userId, articleId: { in: articleIds } },
      }),
      getCompletedLearningProblemIds(userId, baseIds),
   ]);

   return calculateLearningProgress(
      readCount + completedProblemIds.size,
      articleIds.length + baseIds.size,
   );
}
