import { $Enums } from '@prisma/client';
import prisma from '~~/lib/prisma';
import {
   USER_SETTING_KEYS,
   getUserSettingBoolean,
} from '~~/server/trpc/services/user-setting';

export type NotificationProps = {
   type: $Enums.NotificationType;
   title: string;
   content: string;
   userId: string;
};

const sendNotification = async (props: NotificationProps) => {
   const { type, title, content, userId } = props;

   // 判题结果通知需用户在设置中主动开启（默认关闭）
   if (type === 'JUDGE') {
      const enabled = await getUserSettingBoolean(
         userId,
         USER_SETTING_KEYS.JUDGE_RESULT_NOTIFY,
      );
      if (!enabled) return null;
   }

   const result = await prisma.notification.create({
      data: {
         type,
         title,
         content,
         userId,
      },
   });
   notificationEmitter.emit('new', { userIds: new Set([userId]) });

   return result;
};

const groupSendNotification = async (
   props: Omit<NotificationProps, 'userId'> & { userIds: string[] },
) => {
   const { type, title, content, userIds } = props;

   const notifications = userIds.map((userId) => ({
      type,
      title,
      content,
      userId,
   }));

   const result = await prisma.notification.createMany({
      data: notifications,
   });
   notificationEmitter.emit('new', { userIds: new Set(userIds) });

   return result;
};

export const notificationService = {
   sendNotification,
   groupSendNotification,
};
