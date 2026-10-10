import z from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import {
   articleExists,
   loadUserProgress,
   markCompleted,
   recordVisit,
   verifyCompletion,
   type ProgressKind,
} from '../../services/learning-progress';

/**
 * 学习进度（访问 / 完成）的读写接口。
 *
 * 用 `protectedProcedure`：进度是**每个人的私有数据**，必须带用户身份
 * （以前存在 localStorage 里，所以谁都能改、换设备就丢）。
 *
 * 「做过哪道题」没有写接口：它由 `judge_records` 的成功提交记录推导
 * （见 learning-progress.ts 的说明），不存第二份真源。
 */
const KindSchema = z.enum(['article', 'topic', 'course', 'problem']);

export const learningProgressRouter = router({
   /** 一次取全：访问 + 完成 + 已做过的题号 */
   me: protectedProcedure.query(async ({ ctx }) =>
      loadUserProgress(ctx.user.userId),
   ),

   /** 记一次访问（打开文章 / 专题时调用） */
   visit: protectedProcedure
      .input(z.object({ kind: KindSchema, targetId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) =>
         recordVisit(ctx.user.userId, input.kind as ProgressKind, input.targetId),
      ),

   /**
    * 标记完成。
    *
    * 服务端会**重新校验**（题目是不是真的都做过、纯阅读是不是真的都读过），
    * 校验不通过就不写——完成是不可逆的记录，不能只听客户端说。
    */
   complete: protectedProcedure
      .input(
         z.object({
            kind: z.enum(['article', 'topic', 'course']),
            targetId: z.string().min(1),
         }),
      )
      .mutation(async ({ ctx, input }) => {
         const { userId } = ctx.user;

         // 纯阅读文章：读过即可标记（不写完成表，只保证访问记录存在）
         if (input.kind === 'article') {
            const article = await articleExists(input.targetId);
            if (!article) {
               throw new TRPCError({ code: 'NOT_FOUND', message: '没有这篇文章' });
            }
            return recordVisit(userId, 'article', input.targetId);
         }

         const ok = await verifyCompletion(userId, input.kind, input.targetId);
         if (!ok) {
            throw new TRPCError({
               code: 'BAD_REQUEST',
               message: '这个内容还没有真正完成（题目未全部做过，或文章未读完）',
            });
         }
         return markCompleted(userId, input.kind, input.targetId);
      }),
});
