import { TRPCError } from '@trpc/server';
import type { Prisma } from '@prisma/client';
import z from 'zod';
import prisma from '~~/lib/prisma';
import { notificationEmitter } from '~~/server/utils/event-emitter';
import { protectedAdminProcedure } from '../../protected-trpc';
import { FeedbackCategorySchema } from '../../schemas/feedback-schema';
import { router } from '../../trpc';

const listProcedure = protectedAdminProcedure
   .input(
      z.object({
         category: FeedbackCategorySchema.optional(),
         status: z.enum(['new', 'reviewed', 'resolved']).optional(),
         page: z.number().int().min(1).max(100_000).default(1),
         pageSize: z.number().int().min(1).max(100).default(20),
      }).prefault({}),
   )
   .query(async ({ input: { category, status, page, pageSize } }) => {
      const where: Prisma.FeedbackWhereInput = { category };
      if (status === 'new') where.reviewedAt = null;
      if (status === 'reviewed') {
         where.reviewedAt = { not: null };
         where.resolvedAt = null;
      }
      if (status === 'resolved') where.resolvedAt = { not: null };

      const [total, feedback] = await prisma.$transaction(
         [
            prisma.feedback.count({ where }),
            prisma.feedback.findMany({
               where,
               orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
               skip: (page - 1) * pageSize,
               take: pageSize,
               select: {
                  id: true,
                  category: true,
                  description: true,
                  contact: true,
                  pagePath: true,
                  traceId: true,
                  createdAt: true,
                  reviewedAt: true,
                  notifyOnResolve: true,
                  resolvedAt: true,
                  resolution: true,
                  user: { select: { id: true, name: true, displayName: true } },
               },
            }),
         ],
         { isolationLevel: 'RepeatableRead' },
      );

      return {
         items: feedback.map(({ createdAt, reviewedAt, resolvedAt, ...item }) => ({
            ...item,
            createdAt: createdAt.toISOString(),
            reviewedAt: reviewedAt?.toISOString() ?? null,
            resolvedAt: resolvedAt?.toISOString() ?? null,
         })),
         total,
      };
   });

const markReviewedProcedure = protectedAdminProcedure
   .input(z.object({ id: z.string().min(1).max(64) }))
   .mutation(async ({ input: { id } }) => {
      await prisma.feedback.updateMany({
         where: { id, reviewedAt: null },
         data: { reviewedAt: new Date() },
      });

      const feedback = await prisma.feedback.findUnique({
         where: { id },
         select: { reviewedAt: true },
      });

      if (!feedback?.reviewedAt) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '反馈不存在。' });
      }

      return { id, reviewedAt: feedback.reviewedAt.toISOString() };
   });

const resolveProcedure = protectedAdminProcedure
   .input(z.object({
      id: z.string().min(1).max(64),
      resolution: z.string().trim().max(1000).refine(value => !value.includes('\0')).optional(),
   }))
   .mutation(async ({ input: { id, resolution } }) => {
      const { notificationUserId } = await prisma.$transaction(async (tx) => {
         const item = await tx.feedback.findUnique({ where: { id } });
         if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: '反馈不存在。' });
         if (item.resolvedAt) return { notificationUserId: null };

         const recipient = item.notifyOnResolve ? item.userId : null;
         if (recipient && !resolution) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: '请填写要发送给用户的处理结果。' });
         }

         const now = new Date();
         const { count } = await tx.feedback.updateMany({
            where: { id, resolvedAt: null },
            data: { resolvedAt: now, reviewedAt: item.reviewedAt ?? now, resolution: recipient ? resolution : null },
         });
         if (count === 0 || !recipient || !resolution) return { notificationUserId: null };

         // Notification details render Markdown. Keep the administrator's reply plain text.
         const reply = resolution.replace(/[\\`*_{}\[\]()<>#+.!|~\-]/g, '\\$&');
         await tx.notification.create({
            data: {
               userId: recipient,
               type: 'SYSTEM',
               title: '你的反馈已处理',
               content: `反馈编号：\`${id}\`\n\n${reply}`,
            },
         });
         return { notificationUserId: recipient };
      });

      if (notificationUserId) {
         notificationEmitter.emit('new', { userIds: new Set([notificationUserId]) });
      }
      return { id };
   });

export const feedbackAdminRouter = router({
   list: listProcedure,
   markReviewed: markReviewedProcedure,
   resolve: resolveProcedure,
});
