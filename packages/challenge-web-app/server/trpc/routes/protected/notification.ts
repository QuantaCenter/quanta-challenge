import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
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
   'ANNOUNCEMENT',
   'WARNING',
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
         include: {
            appeal: { select: { status: true, createdAt: true } },
            scorePenalty: { select: { score: true, revokedAt: true } },
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

const unreadWarningCountProcedure = protectedProcedure.query(
   async ({ ctx }) => {
      return await prisma.notification.count({
         where: {
            userId: ctx.user.userId,
            type: 'WARNING',
            read: false,
         },
      });
   },
);

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

const AppealSchema = z.object({
   notificationId: z.string(),
   content: z
      .string()
      .trim()
      .min(1, '申诉内容不能为空')
      .max(1000, '申诉内容最长 1000 字'),
});

/** 提交警告申诉 */
const appealProcedure = protectedProcedure
   .input(AppealSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      const notification = await prisma.notification.findFirst({
         where: { id: input.notificationId, userId, type: 'WARNING' },
         select: { id: true },
      });
      if (!notification) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '警告不存在' });
      }

      try {
         return await prisma.appeal.create({
            data: {
               userId,
               notificationId: notification.id,
               content: input.content,
            },
            select: { status: true, createdAt: true },
         });
      } catch (error) {
         if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
         ) {
            throw new TRPCError({
               code: 'CONFLICT',
               message: '该警告已提交过申诉',
            });
         }
         throw error;
      }
   });

// Router
export const notificationRouter = router({
   list: listNotificationsProcedure,
   unreadCount: unreadCountProcedure,
   unreadWarningCount: unreadWarningCountProcedure,
   markAsRead: markAsReadProcedure,
   markAllAsRead: markAllAsReadProcedure,
   appeal: appealProcedure,
});
