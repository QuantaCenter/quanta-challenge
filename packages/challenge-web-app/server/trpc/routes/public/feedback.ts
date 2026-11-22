import { TRPCError } from '@trpc/server';
import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';
import { limitRequest } from '../../middlewares/limit-request';
import { SubmitFeedbackSchema } from '../../schemas/feedback-schema';
import { publicProcedure, router } from '../../trpc';

const submitProcedure = publicProcedure
   .use(limitRequest(5, { scope: 'feedback', byUser: true }))
   .input(SubmitFeedbackSchema)
   .mutation(async ({ ctx, input }) => {
      const { submissionId, ...feedback } = input;
      const userId = ctx.user?.userId;
      if (feedback.notifyOnResolve && !userId) {
         throw new TRPCError({ code: 'UNAUTHORIZED', message: '登录后才能接收处理通知。' });
      }
      const data = { ...feedback, contact: userId ? null : feedback.contact, userId };

      try {
         if (submissionId) {
            // The primary key makes concurrent retries of one draft safe.
            await prisma.feedback.createMany({
               data: { ...data, id: submissionId },
               skipDuplicates: true,
            });
            return { id: submissionId };
         }

         return await prisma.feedback.create({ data, select: { id: true } });
      } catch (error) {
         const code =
            error instanceof Error && 'code' in error ? error.code : undefined;
         logger.error({ code }, '保存用户反馈失败');
         throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: '反馈提交失败，请稍后重试。',
         });
      }
   });

export const feedbackRouter = router({
   session: publicProcedure.query(({ ctx }) => ({ signedIn: Boolean(ctx.user) })),
   submit: submitProcedure,
});
