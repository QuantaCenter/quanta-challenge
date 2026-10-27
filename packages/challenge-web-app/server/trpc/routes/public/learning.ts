import z from 'zod';
import { publicProcedure, router } from '../../trpc';
import {
   findArticle,
   resolveProblemByPid,
   resolveProblemState,
   findPublishedCourse,
   findPublishedTopic,
   listArticles,
   listProblemSummaries,
   listPublishedCourses,
   listPublishedTopics,
} from '../../services/learning-read';

/** 学习内容的学习侧只读接口，只暴露已上架的课程与专题 */
const IdSchema = z.object({ id: z.string().min(1) });

export const learningPublicRouter = router({
   /** 课程列表（只含已上架） */
   courses: publicProcedure.query(async () => listPublishedCourses()),

   /** 课程详情（只含已上架；不存在或未上架都返回 null） */
   course: publicProcedure
      .input(IdSchema)
      .query(async ({ input }) => findPublishedCourse(input.id)),

   /** 专题列表：可按课程筛选；只含「课程已上架」的专题 */
   topics: publicProcedure
      .input(
         z
            .object({ courseId: z.string().min(1).optional() })
            .optional()
            .default({}),
      )
      .query(async ({ input }) => listPublishedTopics(input.courseId)),

   /** 专题详情（课程未上架时返回 null） */
   topic: publicProcedure
      .input(IdSchema)
      .query(async ({ input }) => findPublishedTopic(input.id)),

   /** 全站文章：不受专题/课程状态影响 */
   articles: publicProcedure
      .input(
         z
            .object({ ids: z.array(z.string()).optional() })
            .optional()
            .default({}),
      )
      .query(async ({ input }) => listArticles(input.ids)),

   article: publicProcedure
      .input(IdSchema)
      .query(async ({ input }) => findArticle(input.id)),

   /** 按题号取当前已发布版本的 pid，未发布返回 null */
   problemByBaseId: publicProcedure
      .input(z.object({ baseId: z.number().int().positive() }))
      .query(async ({ input }) => {
         const resolved = await resolveProblemState(input.baseId);
         // 有可做版本（当前已发布，或被更新的已发布版本取代）就给 pid
         return {
            baseId: input.baseId,
            pid: resolved.pid,
            state: resolved.state,
         };
      }),

   /** 按 pid 取题号与可用性：做题页的访问闸用它，避免依赖登录态 */
   problemByPid: publicProcedure
      .input(z.object({ pid: z.number().int().positive() }))
      .query(async ({ input }) => resolveProblemByPid(input.pid)),

   /** 题目摘要，只回已发布的题 */
   problems: publicProcedure
      .input(z.object({ baseIds: z.array(z.number().int()).max(100) }))
      .query(async ({ input }) => listProblemSummaries(input.baseIds)),
});
