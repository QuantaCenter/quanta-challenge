import prisma from '~~/lib/prisma';
import type { LearningKind } from '@prisma/client';

/**
 * 学习进度（访问 / 做题 / 完成）的服务端读写。
 */

/** 前端种类名，数据库枚举为大写 */
export type ProgressKind = 'article' | 'topic' | 'course' | 'problem';

const TO_DB: Record<ProgressKind, LearningKind> = {
   article: 'ARTICLE',
   topic: 'TOPIC',
   course: 'COURSE',
   problem: 'PROBLEM',
};

const FROM_DB: Record<LearningKind, ProgressKind> = {
   ARTICLE: 'article',
   TOPIC: 'topic',
   COURSE: 'course',
   PROBLEM: 'problem',
};

/** 时间戳格式 YYYY-MM-DD HH:mm，字典序即时间序 */
export const progressStamp = (date = new Date()) => {
   const pad = (value: number) => String(value).padStart(2, '0');
   return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
   );
};

export interface UserLearningProgress {
   /** 访问记录：`kind:targetId` → 时间 */
   visits: Record<string, string>;
   /** 完成标记：`kind:targetId` → 时间（不可逆） */
   completions: Record<string, string>;
   /** 已做过的题号（base_problems.id） */
   solved: number[];
}

const progressKey = (kind: ProgressKind, targetId: string) =>
   `${kind}:${targetId}`;

/** 文章是否存在（标记"已读"前校验，避免给不存在的对象写记录） */
export const articleExists = async (articleId: string) => {
   const row = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true },
   });
   return Boolean(row);
};

/** 一次取全：访问 + 完成 + 已做过的题。页面加载时调一次即可。 */
export const loadUserProgress = async (
   userId: string,
): Promise<UserLearningProgress> => {
   const [visits, completions, solvedRecords] = await Promise.all([
      prisma.learningVisit.findMany({
         where: { userId },
         select: { kind: true, targetId: true, visitedAt: true },
      }),
      prisma.learningCompletion.findMany({
         where: { userId },
         select: { kind: true, targetId: true, completedAt: true },
      }),
      // 「做过」= 有过成功的提交记录（权威事实，不再单独存一张表）
      prisma.judgeRecords.findMany({
         where: { userId, type: 'judge', result: 'success' },
         select: { problem: { select: { baseId: true } } },
         distinct: ['problemId'],
      }),
   ]);

   return {
      visits: Object.fromEntries(
         visits.map((row) => [
            progressKey(FROM_DB[row.kind], row.targetId),
            progressStamp(row.visitedAt),
         ]),
      ),
      completions: Object.fromEntries(
         completions.map((row) => [
            progressKey(FROM_DB[row.kind], row.targetId),
            progressStamp(row.completedAt),
         ]),
      ),
      solved: [
         ...new Set(solvedRecords.map((row) => row.problem.baseId)),
      ].sort((a, b) => a - b),
   };
};

/** 记一次访问，同一对象只更新时间 */
export const recordVisit = async (
   userId: string,
   kind: ProgressKind,
   targetId: string,
) => {
   const dbKind = TO_DB[kind];
   const now = new Date();
   await prisma.learningVisit.upsert({
      where: { userId_kind_targetId: { userId, kind: dbKind, targetId } },
      update: { visitedAt: now },
      create: { userId, kind: dbKind, targetId, visitedAt: now },
   });
   return { kind, targetId, at: progressStamp(now) };
};

/** 记一次完成，只会新增不会回退 */
export const markCompleted = async (
   userId: string,
   kind: ProgressKind,
   targetId: string,
) => {
   const dbKind = TO_DB[kind];
   const existing = await prisma.learningCompletion.findUnique({
      where: { userId_kind_targetId: { userId, kind: dbKind, targetId } },
      select: { completedAt: true },
   });
   if (existing) {
      return { kind, targetId, at: progressStamp(existing.completedAt) };
   }

   const now = new Date();
   await prisma.learningCompletion.create({
      data: { userId, kind: dbKind, targetId, completedAt: now },
   });
   return { kind, targetId, at: progressStamp(now) };
};

/** 服务端校验完成状态，按权威事实重算 */
export const verifyCompletion = async (
   userId: string,
   kind: 'topic' | 'course',
   targetId: string,
): Promise<boolean> => {
   const solvedBaseIds = new Set(
      (
         await prisma.judgeRecords.findMany({
            where: { userId, type: 'judge', result: 'success' },
            select: { problem: { select: { baseId: true } } },
            distinct: ['problemId'],
         })
      ).map((row) => row.problem.baseId),
   );

   const topicDone = async (topicId: string): Promise<boolean> => {
      const topic = await prisma.topic.findUnique({
         where: { id: topicId },
         select: {
            Articles: {
               select: {
                  Article: {
                     select: { id: true, Problems: { select: { baseId: true } } },
                  },
               },
            },
         },
      });
      if (!topic || topic.Articles.length === 0) return false;

      const articles = topic.Articles.map((row) => row.Article);
      const problems = articles.flatMap((article) => article.Problems);
      if (problems.length > 0) {
         return problems.every((problem) => solvedBaseIds.has(problem.baseId));
      }
      // 纯阅读专题：每篇文章都要有访问记录（"打开过"才算读过）
      const visited = await prisma.learningVisit.count({
         where: {
            userId,
            kind: 'ARTICLE',
            targetId: { in: articles.map((article) => article.id) },
         },
      });
      return visited === articles.length;
   };

   if (kind === 'topic') return topicDone(targetId);

   const topics = await prisma.topic.findMany({
      where: { courseId: targetId },
      select: { id: true },
   });
   if (topics.length === 0) return false;
   for (const topic of topics) {
      if (!(await topicDone(topic.id))) return false;
   }
   return true;
};
