import prisma from '~~/lib/prisma';

/**
 * 用户设置项 key（与 app/configs/user_settings.ts 中的 UserSettingsKeys 保持一致）
 */
export const USER_SETTING_KEYS = {
   /** 判题结果通知开关 */
   JUDGE_RESULT_NOTIFY: 'judge_result_notify',
} as const;

export type UserSettingKey =
   (typeof USER_SETTING_KEYS)[keyof typeof USER_SETTING_KEYS];

export const getUserSettingValue = async (userId: string, key: string) => {
   const setting = await prisma.userSetting.findUnique({
      where: { userId_key: { userId, key } },
      select: { value: true },
   });
   return setting?.value ?? null;
};

/**
 * 读取布尔设置，未设置或值非法时返回默认值
 */
export const getUserSettingBoolean = async (
   userId: string,
   key: string,
   defaultValue = false,
) => {
   const value = await getUserSettingValue(userId, key);
   if (value === null) return defaultValue;
   return value === 'true';
};

export const getUserSettingMap = async (userId: string) => {
   const settings = await prisma.userSetting.findMany({
      where: { userId },
      select: { key: true, value: true },
   });
   return Object.fromEntries(settings.map((s) => [s.key, s.value]));
};

export const upsertUserSetting = async (
   userId: string,
   key: string,
   value: string,
) => {
   await prisma.userSetting.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, value },
      update: { value },
   });
};

export const userSettingService = {
   getUserSettingValue,
   getUserSettingBoolean,
   getUserSettingMap,
   upsertUserSetting,
};
