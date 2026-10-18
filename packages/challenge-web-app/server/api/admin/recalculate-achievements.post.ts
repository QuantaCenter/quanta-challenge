import prisma from '~~/lib/prisma';
import { observer } from '~~/server/trpc/services/achievement';
import { logger } from '~~/server/utils/logger';

/* 重算成就进度（回填历史数据）。*/
export default defineEventHandler(async (event) => {
   const secret = process.env.OPENAPI_WEBHOOK_SECRET;
   const provided =
      getHeader(event, 'x-webhook-secret') ?? (getQuery(event).secret as string);

   if (!secret || provided !== secret) {
      throw createError({ statusCode: 403, message: 'Forbidden' });
   }

   const users = await prisma.user.findMany({ select: { id: true, name: true } });
   const achievements = await prisma.achievement.findMany({
      select: { id: true, name: true, score: true },
   });

   const results: {
      user: string;
      achievement: string;
      achieved: boolean;
      progress: number;
   }[] = [];

   for (const user of users) {
      for (const achievement of achievements) {
         try {
            // 显式把 userId 传进去：这个接口不在用户请求上下文里，
            // 不传的话依赖数据加载器的 `__ctx.userId` 取不到值（见观察者的说明）。
            const result = await observer.triggerCheckAchievement(
               achievement.id,
               user.id,
               { userId: user.id },
            );

            if (result === false) {
               // 已达成 / 前置未达成 -> 短路，不算失败
               results.push({
                  user: user.name,
                  achievement: achievement.name,
                  achieved: true,
                  progress: 1,
               });
               continue;
            }

            results.push({
               user: user.name,
               achievement: achievement.name,
               achieved: result.achieved,
               progress: result.progress,
            });
         } catch (error) {
            logger.error(
               { error, userId: user.id, achievementId: achievement.id },
               '重算成就失败（已跳过，继续处理其它成就）',
            );
            results.push({
               user: user.name,
               achievement: achievement.name,
               achieved: false,
               progress: -1,
            });
         }
      }
   }

   return {
      users: users.length,
      achievements: achievements.length,
      results,
   };
});
