import prisma from '@challenge/database';
import type { CourseStatus } from '@prisma/client';
import {
   SEED_ARTICLES,
   SEED_COURSES,
   SEED_TOPICS,
} from '../app/composables/learning-content';

/**
 * 把「学习内容」的初始内容灌进数据库：课程 / 专题 / 文章。
 *
 * 为什么需要它：这三张表以前只存在于浏览器 localStorage（前端常量 + 本地快照），
 * 换台机器就没了。现在服务端是真源，初始内容也必须能被重复部署 ——
 * 所以这里从 `app/composables/learning-content.ts` 读同一份常量写库，
 * 保证「代码里的初始内容」与「库里的初始内容」永远一致。
 *
 * 幂等：按 slug upsert。重复执行只会把内容对齐到常量，不会产生重复行；
 * 用户自己新建的内容（slug 不在常量里）不受影响。
 */
const COURSE_STATUS_FROM_SEED: CourseStatus = 'PUBLISHED';

/** 正文里的 `<Problem baseId={…} />` 就是文章引用题目的唯一来源 */
const parseProblemBaseIds = (source: string): number[] => {
   const pattern = /<Problem\s+baseId=\{(\d+)\}\s*\/>/g;
   const ids: number[] = [];
   for (const match of source.matchAll(pattern)) {
      const baseId = Number(match[1]);
      if (!ids.includes(baseId)) ids.push(baseId);
   }
   return ids;
};

export async function seedLearningContent() {
   const author = await prisma.user.findFirst({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
   });
   if (!author) {
      console.warn('⚠️  没有管理员账号，跳过学习内容种子（先跑账号种子）');
      return;
   }

   // 库里已有的题号集合：正文引用了一道库里没有的题会被拒绝（§17.2）
   const publishedBaseIds = new Set(
      (
         await prisma.baseProblems.findMany({
            where: { CurrentProblem: { status: 'published' } },
            select: { id: true },
         })
      ).map((row) => row.id),
   );

   /* ---------- 课程 ---------- */
   const courseIdBySlug = new Map<string, string>();
   for (const course of SEED_COURSES) {
      const existing = await prisma.course.findUnique({
         where: { slug: course.slug },
         select: { id: true },
      });
      const row = await prisma.course.upsert({
         where: { slug: course.slug },
         update: {
            name: course.name,
            description: course.description,
            weight: course.weight,
            coverPreset: course.coverPreset,
         },
         create: {
            authorId: author.id,
            slug: course.slug,
            name: course.name,
            description: course.description,
            weight: course.weight,
            coverPreset: course.coverPreset,
            status: COURSE_STATUS_FROM_SEED,
            reviewedAt: new Date(),
         },
         select: { id: true },
      });
      courseIdBySlug.set(course.slug, row.id);
      if (!existing) {
         await prisma.courseReviewRecord.create({
            data: {
               courseId: row.id,
               actorId: author.id,
               action: 'APPROVE',
               reason: '初始内容种子',
               toStatus: COURSE_STATUS_FROM_SEED,
            },
         });
      }
   }

   /* ---------- 文章（先建，专题要引用它的 id） ---------- */
   const articleIdBySlug = new Map<string, string>();
   let skippedProblemRefs = 0;
   for (const article of SEED_ARTICLES) {
      const row = await prisma.article.upsert({
         where: { slug: article.slug },
         update: {
            title: article.title,
            summary: article.summary,
            source: article.body,
            coverPreset: article.coverPreset,
         },
         create: {
            authorId: author.id,
            slug: article.slug,
            title: article.title,
            summary: article.summary,
            source: article.body,
            coverPreset: article.coverPreset,
         },
         select: { id: true },
      });
      articleIdBySlug.set(article.slug, row.id);

      // 题目引用：正文是唯一真源，每次 seed 整体重算这张表
      const baseIds = parseProblemBaseIds(article.body);
      const accepted = baseIds.filter((baseId) => {
         const ok = publishedBaseIds.has(baseId);
         if (!ok) skippedProblemRefs += 1;
         return ok;
      });

      await prisma.$transaction([
         prisma.articleProblem.deleteMany({ where: { articleId: row.id } }),
         prisma.articleProblem.createMany({
            data: accepted.map((baseId, index) => ({
               articleId: row.id,
               baseId,
               sort: index,
            })),
         }),
      ]);
   }

   /* ---------- 专题（引用文章 + 前置专题） ---------- */
   const topicIdBySlug = new Map<string, string>();
   for (const topic of SEED_TOPICS) {
      const courseId = courseIdBySlug.get(topic.courseSlug);
      if (!courseId) {
         console.warn(`⚠️  专题「${topic.name}」找不到课程 ${topic.courseSlug}，跳过`);
         continue;
      }

      const row = await prisma.topic.upsert({
         where: { courseId_slug: { courseId, slug: topic.slug } },
         update: {
            name: topic.name,
            description: topic.description,
            weight: topic.weight,
            coverPreset: topic.coverPreset,
            courseId,
         },
         create: {
            authorId: author.id,
            courseId,
            slug: topic.slug,
            name: topic.name,
            description: topic.description,
            weight: topic.weight,
            coverPreset: topic.coverPreset,
         },
         select: { id: true },
      });
      topicIdBySlug.set(topic.slug, row.id);

      const articleRows = topic.articleSlugs
         .map((slug) => articleIdBySlug.get(slug))
         .filter((id): id is string => id !== undefined);

      await prisma.$transaction([
         prisma.topicArticle.deleteMany({ where: { topicId: row.id } }),
         prisma.topicArticle.createMany({
            data: articleRows.map((articleId, index) => ({
               topicId: row.id,
               articleId,
               sort: index,
            })),
         }),
      ]);
   }

   // 前置专题要等所有专题都有 id 之后再写
   for (const topic of SEED_TOPICS) {
      const topicId = topicIdBySlug.get(topic.slug);
      if (!topicId) continue;
      const prerequisiteIds = topic.prerequisites
         .map((slug) => topicIdBySlug.get(slug))
         .filter((id): id is string => id !== undefined);

      await prisma.$transaction([
         prisma.topicPrerequisite.deleteMany({ where: { topicId } }),
         prisma.topicPrerequisite.createMany({
            data: prerequisiteIds.map((prerequisiteId) => ({
               topicId,
               prerequisiteId,
            })),
         }),
      ]);
   }

   console.log(
      `✅ 学习内容种子完成：${SEED_COURSES.length} 课程 / ${SEED_TOPICS.length} 专题 / ${SEED_ARTICLES.length} 文章` +
         (skippedProblemRefs > 0
            ? `（跳过 ${skippedProblemRefs} 处未发布题目的引用）`
            : ''),
   );
}
