import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';

// Schemas
const NotificationTypeSchema = z.enum([
   'SYSTEM',
   'COMMENT',
   'LIKE',
   'JUDGE',
   'ACHIEVEMENT',
]);

const ListNotificationsSchema = z.object({
   type: z.union([
      NotificationTypeSchema,
      z.literal('ALL'),
      z.literal('UNREAD'),
   ]),
   cursor: z.string().nullish(),
   limit: z.number().min(1).max(100).default(20),
});

const MarkAsReadSchema = z.object({
   id: z.string(),
});

// Procedures
const listNotificationsProcedure = protectedProcedure
   .input(ListNotificationsSchema)
   .query(async ({ ctx, input }) => {
      const { user } = ctx;
      const { type, cursor, limit } = input;

      const where: any = { userId: user.userId };
      if (type !== 'ALL' && type !== 'UNREAD') {
         where.type = type;
      }
      if (type === 'UNREAD') {
         where.read = false;
      }

      const items = await prisma.notification.findMany({
         where,
         take: limit + 1,
         cursor: cursor ? { id: cursor } : undefined,
         orderBy: {
            createdAt: 'desc',
         },
      });

      let nextCursor: string | null = null;
      if (items.length > limit) {
         const nextItem = items.pop();
         nextCursor = nextItem!.id;
      }

      return {
         items,
         nextCursor,
      };
   });

const unreadCountProcedure = protectedProcedure.query(async ({ ctx }) => {
   const { user } = ctx;
   return await prisma.notification.count({
      where: {
         userId: user.userId,
         read: false,
      },
   });
});

const markAsReadProcedure = protectedProcedure
   .input(MarkAsReadSchema)
   .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      await prisma.notification.updateMany({
         where: {
            id: input.id,
            userId: user.userId,
         },
         data: {
            read: true,
         },
      });
      return true;
   });

const markAllAsReadProcedure = protectedProcedure.mutation(async ({ ctx }) => {
   const { user } = ctx;
   await prisma.notification.updateMany({
      where: {
         userId: user.userId,
         read: false,
      },
      data: {
         read: true,
      },
   });
   return true;
});

// Router
export const notificationRouter = router({
   list: listNotificationsProcedure,
   unreadCount: unreadCountProcedure,
   markAsRead: markAsReadProcedure,
   markAllAsRead: markAllAsReadProcedure,
});
