import { TRPCError } from '@trpc/server';
import z from 'zod';
import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';
import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import { notificationService } from '../../services/notificatoin';
import { rankService } from '../../services/rank';

const SendNotificationSchema = z
   .object({
      type: z.enum(['ANNOUNCEMENT', 'WARNING']),
      title: z
         .string()
         .trim()
         .min(1, '标题不能为空')
         .max(100, '标题最长 100 字'),
      content: z
         .string()
         .trim()
         .min(1, '内容不能为空')
         .max(5000, '内容最长 5000 字'),
      target: z.discriminatedUnion('scope', [
         z.object({ scope: z.literal('ALL') }),
         z.object({
            scope: z.literal('USERS'),
            userNames: z.array(z.string().trim().min(1)).min(1).max(500),
         }),
      ]),
      /** 扣分分值，0 表示不扣 */
      penaltyScore: z.number().int().min(0).max(10000).default(0),
   })
   .refine(
      (input) =>
         input.penaltyScore === 0 ||
         (input.type === 'WARNING' && input.target.scope === 'USERS'),
      { message: '只有向指定用户发送严重警告时才能扣分', path: ['penaltyScore'] },
   );

const resolveUserIds = async (
   target: z.infer<typeof SendNotificationSchema>['target'],
) => {
   if (target.scope === 'ALL') {
      const users = await prisma.user.findMany({ select: { id: true } });
      return users.map((user) => user.id);
   }

   const userNames = [...new Set(target.userNames)];
   const users = await prisma.user.findMany({
      where: { name: { in: userNames } },
      select: { id: true, name: true },
   });
   const found = new Set(users.map((user) => user.name));
   const missing = userNames.filter((name) => !found.has(name));
   if (missing.length) {
      throw new TRPCError({
         code: 'BAD_REQUEST',
         message: `以下用户不存在：${missing.join('、')}`,
      });
   }
   return users.map((user) => user.id);
};

/** 发送通知 */
const sendProcedure = protectedAdminProcedure
   .input(SendNotificationSchema)
   .mutation(async ({ input }) => {
      const { type, title, content, target, penaltyScore } = input;

      const userIds = await resolveUserIds(target);
      if (!userIds.length) return { count: 0 };

      if (penaltyScore === 0) {
         const result = await notificationService.groupSendNotification({
            type,
            title,
            content,
            userIds,
         });
         return { count: result.count };
      }

      await prisma.$transaction(async (tx) => {
         const notifications = await tx.notification.createManyAndReturn({
            data: userIds.map((userId) => ({ type, title, content, userId })),
            select: { id: true, userId: true },
         });
         await tx.scorePenalty.createMany({
            data: notifications.map((notification) => ({
               userId: notification.userId,
               notificationId: notification.id,
               score: penaltyScore,
            })),
         });
      });
      notificationEmitter.emit('new', { userIds: new Set(userIds) });

      await rankService.syncUserScores(userIds).catch((err) => {
         logger.error({ err, userIds }, '警告扣分后同步排行榜失败');
      });

      return { count: userIds.length };
   });

export const notificationAdminRouter = router({
   send: sendProcedure,
});
