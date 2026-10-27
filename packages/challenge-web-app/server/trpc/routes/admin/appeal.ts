import { TRPCError } from '@trpc/server';
import z from 'zod';
import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';
import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import { notificationService } from '../../services/notificatoin';
import { rankService } from '../../services/rank';

const AppealListSchema = z.object({
   status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
   page: z.number().int().min(1).default(1),
   pageSize: z.number().int().min(1).max(100).default(20),
});

/** 申诉列表 */
const listProcedure = protectedAdminProcedure
   .input(AppealListSchema.prefault({}))
   .query(async ({ input }) => {
      const { status, page, pageSize } = input;
      const where = status ? { status } : {};

      const [total, appeals] = await Promise.all([
         prisma.appeal.count({ where }),
         prisma.appeal.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
               id: true,
               content: true,
               status: true,
               handledAt: true,
               createdAt: true,
               user: {
                  select: {
                     name: true,
                     displayName: true,
                     avatar: { select: { name: true } },
                  },
               },
               notification: {
                  select: {
                     title: true,
                     content: true,
                     createdAt: true,
                     scorePenalty: { select: { score: true, revokedAt: true } },
                  },
               },
            },
         }),
      ]);

      return {
         appeals: appeals.map(({ user, ...appeal }) => ({
            ...appeal,
            user: {
               name: user.name,
               displayName: user.displayName,
               avatarUrl: user.avatar?.name
                  ? `/api/static/${user.avatar.name}`
                  : null,
            },
         })),
         total,
         page,
         pageSize,
      };
   });

const HandleAppealSchema = z.object({
   id: z.string(),
   decision: z.enum(['APPROVE', 'REJECT']),
});

/** 处理申诉 */
const handleProcedure = protectedAdminProcedure
   .input(HandleAppealSchema)
   .mutation(async ({ ctx, input }) => {
      const approved = input.decision === 'APPROVE';

      const { appeal, restoredScore } = await prisma.$transaction(
         async (tx) => {
            const { count } = await tx.appeal.updateMany({
               where: { id: input.id, status: 'PENDING' },
               data: {
                  status: approved ? 'APPROVED' : 'REJECTED',
                  handledById: ctx.user.userId,
                  handledAt: new Date(),
               },
            });
            if (count === 0) {
               throw new TRPCError({
                  code: 'CONFLICT',
                  message: '申诉不存在或已被处理',
               });
            }

            const appeal = await tx.appeal.findUniqueOrThrow({
               where: { id: input.id },
               select: {
                  userId: true,
                  notificationId: true,
                  notification: { select: { title: true } },
               },
            });

            let restoredScore = 0;
            if (approved) {
               const penalty = await tx.scorePenalty.findFirst({
                  where: {
                     notificationId: appeal.notificationId,
                     revokedAt: null,
                  },
                  select: { id: true, score: true },
               });
               if (penalty) {
                  await tx.scorePenalty.update({
                     where: { id: penalty.id },
                     data: { revokedAt: new Date() },
                  });
                  restoredScore = penalty.score;
               }
            }

            return { appeal, restoredScore };
         },
      );

      if (restoredScore > 0) {
         await rankService.syncUserScores([appeal.userId]).catch((err) => {
            logger.error(
               { err, appealId: input.id },
               '申诉通过后同步排行榜失败',
            );
         });
      }

      const warningTitle = appeal.notification.title;
      await notificationService.sendNotification({
         type: 'SYSTEM',
         userId: appeal.userId,
         title: approved ? '申诉成功' : '申诉被驳回',
         content: approved
            ? `你对警告「${warningTitle}」的申诉已通过${
                 restoredScore > 0 ? `，被扣除的 ${restoredScore} 分已恢复` : ''
              }。`
            : `你对警告「${warningTitle}」的申诉经审核未通过，警告维持原判。`,
      });

      return { status: approved ? 'APPROVED' : 'REJECTED', restoredScore };
   });

export const appealAdminRouter = router({
   list: listProcedure,
   handle: handleProcedure,
});
