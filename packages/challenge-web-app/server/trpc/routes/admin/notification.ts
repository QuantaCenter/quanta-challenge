import { TRPCError } from '@trpc/server';
import dayjs from 'dayjs';
import z from 'zod';
import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import {
  dispatchNotificationTask,
  resolveNotificationTarget,
  sendNotificationToUsers,
} from '../../../services/send-notification';

const SendNotificationBase = z.object({
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
});

/** 只有向指定用户发送严重警告时才能扣分 */
const penaltyRefine = {
  refine: (input: {
    penaltyScore: number;
    type: 'ANNOUNCEMENT' | 'WARNING';
    target: { scope: string };
  }) =>
    input.penaltyScore === 0 ||
    (input.type === 'WARNING' && input.target.scope === 'USERS'),
  message: '只有向指定用户发送严重警告时才能扣分',
  path: ['penaltyScore'],
};

const SendNotificationSchema = SendNotificationBase.refine(
  penaltyRefine.refine,
  { message: penaltyRefine.message, path: penaltyRefine.path }
);

const ScheduledSendNotificationSchema = SendNotificationBase.extend({
  /** 预定发送时间，必须晚于当前时间 */
  runAt: z.coerce
    .date()
    .refine((date) => dayjs(date).isAfter(dayjs()), {
      message: '发送时间必须晚于当前时间',
    }),
}).refine(penaltyRefine.refine, {
  message: penaltyRefine.message,
  path: penaltyRefine.path,
});

/** 发送通知（立即） */
const sendProcedure = protectedAdminProcedure
  .input(SendNotificationSchema)
  .mutation(async ({ input }) => {
    const { type, title, content, target, penaltyScore } = input;

    const userIds = await resolveNotificationTarget(target);
    const count = await sendNotificationToUsers({
      type,
      title,
      content,
      userIds,
      penaltyScore,
    });
    return { count };
  });

/** 定时发送通知：到期后由 timer worker 执行 send-notification 处理器 */
const scheduledSendProcedure = protectedAdminProcedure
  .input(ScheduledSendNotificationSchema)
  .mutation(async ({ input }) => {
    const { type, title, content, target, penaltyScore, runAt } = input;

    // USERS 范围在创建时即校验用户存在，避免到期后才发现收件人无效
    if (target.scope === 'USERS') {
      try {
        await resolveNotificationTarget(target);
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            err instanceof Error ? err.message : '接收用户校验失败，请稍后重试',
        });
      }
    }

    const taskId = await dispatchNotificationTask(
      { type, title, content, target, penaltyScore },
      { runAt }
    );
    return { taskId, runAt };
  });

export const notificationAdminRouter = router({
  send: sendProcedure,
  scheduledSend: scheduledSendProcedure,
});
