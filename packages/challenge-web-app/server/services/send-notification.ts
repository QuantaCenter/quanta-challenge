import prisma from '~~/lib/prisma';
import { notificationEmitter } from '../utils/event-emitter';
import {
  dispatchTimerTask,
  registerTimerHandler,
} from '../utils/timer';
import { logger } from '../utils/logger';
import { rankService } from '../trpc/services/rank';
import { notificationService } from '../trpc/services/notificatoin';

export type SendNotificationTarget =
  | { scope: 'ALL' }
  | { scope: 'USERS'; userNames: string[] };

/** send-notification 定时任务载荷 */
export type SendNotificationPayload = {
  type: 'ANNOUNCEMENT' | 'WARNING';
  title: string;
  content: string;
  target: SendNotificationTarget;
  /** 扣分分值，0 表示不扣 */
  penaltyScore: number;
};

/** 把接收对象解析为用户 ID 列表；USERS 中存在未知用户名时抛错 */
export async function resolveNotificationTarget(
  target: SendNotificationTarget
): Promise<string[]> {
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
    throw new Error(`以下用户不存在：${missing.join('、')}`);
  }
  return users.map((user) => user.id);
}

/**
 * 发送核心逻辑：写入通知（含扣分流程），立即发送与定时发送共用。
 * @returns 实际发送人数
 */
export async function sendNotificationToUsers(input: {
  type: SendNotificationPayload['type'];
  title: string;
  content: string;
  userIds: string[];
  penaltyScore: number;
}): Promise<number> {
  const { type, title, content, userIds, penaltyScore } = input;
  if (!userIds.length) return 0;

  if (penaltyScore === 0) {
    const result = await notificationService.groupSendNotification({
      type,
      title,
      content,
      userIds,
    });
    return result.count;
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

  return userIds.length;
}

let registered = false;

/** 注册「定时发送通知」处理器，幂等；由 plugins/timer.ts 在服务启动时调用。 */
export function registerSendNotificationHandler(): void {
  if (registered) return;
  registered = true;

  registerTimerHandler<SendNotificationPayload>(
    'send-notification',
    async (payload) => {
      if (!payload.title || !payload.content) {
        throw new Error('定时通知任务载荷不完整：缺少标题或内容');
      }
      const userIds = await resolveNotificationTarget(payload.target);
      const count = await sendNotificationToUsers({
        type: payload.type,
        title: payload.title,
        content: payload.content,
        userIds,
        penaltyScore: payload.penaltyScore,
      });
      logger.info(
        { title: payload.title, target: payload.target, count },
        '[timer] 定时通知发送完成'
      );
    }
  );
}

/** 发布一个定时发送通知任务，@returns 任务 ID */
export function dispatchNotificationTask(
  payload: SendNotificationPayload,
  options: { runAt: Date }
): Promise<string> {
  return dispatchTimerTask('send-notification', payload, options);
}
