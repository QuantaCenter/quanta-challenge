import z from 'zod';
import { getVerificationCodeEmailTemplate } from '~~/server/templates/verification-code';
import { logger } from '~~/server/utils/logger';
import { publicProcedure, router } from '../../trpc';
import { limitRequest } from '../../middlewares/limit-request';

// 发送邮箱验证码
const SendVerifyCodeSchema = z.object({
   email: z.email(),
});

const sendVerifyCodeProcedure = publicProcedure
   .use(limitRequest(10))
   .input(SendVerifyCodeSchema)
   .mutation(async ({ input }) => {
      const { email } = input;

      // 仅在发送成功后写入验证码，避免发信失败但用户仍可"验证通过"
      const verifyCode = Math.random().toString(10).slice(-4);
      const result = await sendEmail({
         to: email,
         subject: '您的验证码：' + verifyCode,
         html: getVerificationCodeEmailTemplate({
            code: verifyCode,
         }),
      });

      logger.info(result);

      if (!result.success) {
         return false;
      }

      // 必须 await：否则验证码可能尚未落库，用户立刻输入会校验失败
      const redis = useRedis();
      await redis.setex(`verify_code:${email}`, 15 * 60, verifyCode);

      return true;
   });

export const verifyRoute = router({
   sendVerifyCode: sendVerifyCodeProcedure,
});
