import { TRPCError } from '@trpc/server';
import z from 'zod';
import { logger } from '~~/lib/logger';
import prisma from '~~/lib/prisma';
import { protectedAdminProcedure } from '../../protected-trpc';
import {
   feedbackIdSchema,
   feedbackListSchema,
   feedbackStatusSchema,
} from '../../schemas/feedback';
import { router } from '../../trpc';

// 管理端反馈列表（按状态筛选，游标分页）
const listFeedbackProcedure = protectedAdminProcedure
   .input(feedbackListSchema)
   .query(async ({ input }) => {
      const { status, cursor, limit, type, keyword } = input;

      const feedbacks = await prisma.feedback.findMany({
         where: {
            status,
            type,
            ...(keyword
               ? {
                    OR: [
                       { title: { contains: keyword, mode: 'insensitive' } },
                       ...(Number.isSafeInteger(Number(keyword))
                          ? [{ id: Number(keyword) }]
                          : []),
                    ],
                 }
               : {}),
         },
         orderBy: { id: 'desc' },
         take: limit + 1,
         cursor: cursor == null ? undefined : { id: cursor },
         select: {
            id: true,
            type: true,
            title: true,
            status: true,
            baseProblemId: true,
            createdAt: true,
            author: {
               select: { id: true, name: true, displayName: true },
            },
            baseProblem: {
               select: {
                  CurrentProblem: { select: { title: true } },
               },
            },
            _count: { select: { attachments: true } },
         },
      });

      let nextCursor: number | null = null;
      if (feedbacks.length > limit) {
         const last = feedbacks.pop()!;
         nextCursor = last.id;
      }

      return { items: feedbacks, nextCursor };
   });

// 管理端反馈详情
const getFeedbackDetailProcedure = protectedAdminProcedure
   .input(feedbackIdSchema)
   .query(async ({ input }) => {
      const feedback = await prisma.feedback.findUnique({
         where: { id: input.id },
         select: {
            id: true,
            type: true,
            title: true,
            description: true,
            status: true,
            reply: true,
            resolvedAt: true,
            baseProblemId: true,
            pagePath: true,
            diagnostic: true,
            createdAt: true,
            author: {
               select: { id: true, name: true, displayName: true },
            },
            resolvedBy: {
               select: { name: true, displayName: true },
            },
            baseProblem: {
               select: {
                  CurrentProblem: { select: { title: true } },
               },
            },
            updatedAt: true,
            attachments: { select: { id: true } },
            events: {
               orderBy: { id: 'asc' },
               select: {
                  id: true,
                  actorName: true,
                  status: true,
                  reply: true,
                  createdAt: true,
               },
            },
         },
      });

      if (!feedback) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: '反馈不存在',
         });
      }

      return feedback;
   });

// 回复、状态、处理记录与站内通知在同一事务保存。
const ReplyFeedbackSchema = z.object({
   id: z.number('Feedback ID must be a number').int().positive(),
   status: feedbackStatusSchema,
   expectedUpdatedAt: z.string().datetime(),
   reply: z
      .string('请填写回复内容')
      .trim()
      .min(1, '请填写回复内容')
      .max(2000, '回复不能超过 2000 字'),
});

const replyFeedbackProcedure = protectedAdminProcedure
   .input(ReplyFeedbackSchema)
   .mutation(async ({ ctx, input }) => {
      const result = await prisma.$transaction(async (tx) => {
         const feedback = await tx.feedback.findUnique({
            where: { id: input.id },
            select: { authorId: true, title: true },
         });
         if (!feedback)
            throw new TRPCError({ code: 'NOT_FOUND', message: '反馈不存在' });
         const changed = await tx.feedback.updateMany({
            where: {
               id: input.id,
               updatedAt: new Date(input.expectedUpdatedAt),
            },
            data: {
               reply: input.reply,
               status: input.status,
               resolvedById: ctx.user.userId,
               resolvedAt: ['resolved', 'closed'].includes(input.status)
                  ? new Date()
                  : null,
            },
         });
         if (changed.count !== 1)
            throw new TRPCError({
               code: 'CONFLICT',
               message: '反馈已被其他管理员更新，请重新打开后处理',
            });
         const actor = await tx.user.findUnique({
            where: { id: ctx.user.userId },
            select: { displayName: true, name: true },
         });
         await tx.feedbackEvent.create({
            data: {
               feedbackId: input.id,
               actorName: actor?.displayName || actor?.name || '管理员',
               status: input.status,
               reply: input.reply,
            },
         });
         await tx.notification.create({
            data: {
               type: 'FEEDBACK',
               title: '你的反馈有新的处理进展',
               content: `反馈 #${input.id}「${feedback.title}」：${input.reply}`,
               userId: feedback.authorId,
            },
         });
         return { id: input.id, userId: feedback.authorId };
      });
      try {
         notificationEmitter.emit('new', { userIds: new Set([result.userId]) });
      } catch (error) {
         logger.warn({ err: error }, '反馈已保存，实时通知推送失败');
      }
      return { id: result.id };
   });

export const feedbackAdminRouter = router({
   list: listFeedbackProcedure,
   detail: getFeedbackDetailProcedure,
   reply: replyFeedbackProcedure,
});
