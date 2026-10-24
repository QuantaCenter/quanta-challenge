import { z } from 'zod';
import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import {
   USER_SETTING_KEYS,
   getUserSettingMap,
   upsertUserSetting,
} from '../../services/user-setting';

const SettingKeySchema = z.enum(
   Object.values(USER_SETTING_KEYS) as [string, ...string[]],
);

const UpsertSettingSchema = z.object({
   key: SettingKeySchema,
   value: z.string(),
});

/** 读取当前用户全部设置项 */
const getSettingsProcedure = protectedProcedure.query(async ({ ctx }) => {
   return await getUserSettingMap(ctx.user.userId);
});

/** 写入单个设置项 */
const upsertSettingProcedure = protectedProcedure
   .input(UpsertSettingSchema)
   .mutation(async ({ ctx, input }) => {
      await upsertUserSetting(ctx.user.userId, input.key, input.value);
      return true;
   });

export const settingRouter = router({
   get: getSettingsProcedure,
   upsert: upsertSettingProcedure,
});
