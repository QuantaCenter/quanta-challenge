import prisma from '~~/lib/prisma';
import { observer } from '~~/server/trpc/services/achievement';
import { logger } from '~~/lib/logger';

/**
 * 重算成就进度（回填历史数据）。
 *
 * ## 为什么需要它
 *
 * 成就观察者是"事件驱动"的：只有在数据库发生**与成就依赖相关的写入**时才会去判定。
 * 因此新建一个成就之后，用户历史上已经满足条件的记录**不会被追溯**——表现就是
 * 「我之前提交过/签到过，但成就里所有进度都是 0」。库里 `user_achievements` 甚至会
 * 一行都没有，因为从来没有人触发过判定。
 *
 * 这个接口把「所有用户 × 所有成就」逐一判定一次，把历史进度补上（含应得的分值）。
 *
 * ## 幂等性
 *
 * `triggerCheckAchievement` 对"已达成"（progress >= 1）的成就会直接短路返回，
 * 因此重复调用不会重复加分。
 *
 * ## 调用方式
 *
 *   curl -X POST "http://localhost:3000/api/admin/recalculate-achievements" \
 *        -H "x-webhook-secret: $OPENAPI_WEBHOOK_SECRET"
 *
 * 不传 secret 的请求一律 403（与判题 webhook 用同一个共享密钥）。
 */
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
