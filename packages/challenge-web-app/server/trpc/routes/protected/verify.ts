import z from 'zod';
import { getVerificationCodeEmailTemplate } from '~~/server/templates/verification-code';
import { logger } from '~~/server/utils/logger';
import { router } from '../../trpc';
import { limitRequest } from '../../middlewares/limit-request';
import { protectedProcedure } from '../../protected-trpc';
import prisma from '~~/lib/prisma';

// 发送邮箱验证码
const sendVerifyCodeProcedure = protectedProcedure
   .use(limitRequest(10))
   .mutation(async ({ ctx }) => {
      const { userId } = ctx.user;

      const user = await prisma.user.findUnique({
         where: { id: userId },
         select: { email: true },
      });
      if (!user || !user.email) {
         throw new Error('用户不存在或未绑定邮箱');
      }

      const verifyCode = Math.random().toString(10).slice(-4);
      const result = await sendEmail({
         to: user.email,
         subject: '您的验证码：' + verifyCode,
         html: getVerificationCodeEmailTemplate({
            code: verifyCode,
         }),
      });

      const redis = useRedis();
      redis.setex(`verify_code:${user.email}`, 15 * 60, verifyCode);

      logger.info(result);

      return result.success;
   });

// 验证验证码
const VerifyCodeSchema = z.object({
   code: z.string().length(4),
});

type VerifyCodeResult =
   | { success: true; token: string }
   | { success: false; reason: string };

const verifyCodeProcedure = protectedProcedure
   .input(VerifyCodeSchema)
   .mutation(async ({ input, ctx }): Promise<VerifyCodeResult> => {
      const { code } = input;
      const { userId } = ctx.user;

      const user = await prisma.user.findUnique({
         where: { id: userId },
         select: { email: true },
      });
      if (!user || !user.email) {
         throw new Error('用户不存在或未绑定邮箱');
      }

      const redis = useRedis();
      const storedCode = await redis.get(`verify_code:${user.email}`);
      if (storedCode !== code) {
         return {
            success: false,
            reason: '验证码错误或已过期',
         };
      }

      redis.del(`verify_code:${user.email}`);

      const token = Math.random().toString(36).slice(2);
      redis.setex(`verify_token:${token}`, 15 * 60, user.email);

      return {
         success: true,
         token,
      };
   });

export const verifyRoute = router({
   sendVerifyCode: sendVerifyCodeProcedure,
   verifyCode: verifyCodeProcedure,
});
