import z from 'zod';
import { publicProcedure, router } from '../../trpc';
import { hashPassword } from '~~/server/utils/password';
import { generateTokens } from '~~/server/utils/jwt';
import { identityCookieOptions } from '~~/server/utils/auth-cookies';
import prisma from '~~/lib/prisma';
import { TRPCError } from '@trpc/server';

// 邮箱注册
const EmailReisterInputSchema = z
   .object({
      username: z
         .string()
         .regex(
            /^[a-zA-Z0-9_]{3,20}$/,
            'Username must be alphanumeric with underscores only',
         )
         .min(3, 'Username must be at least 3 characters long')
         .max(20, 'Username must be at most 20 characters long'),
      email: z.email('Invalid email address'),
      password: z
         .string()
         .min(6, 'Password must be at least 6 characters long'),
      confirmPassword: z
         .string()
         .min(6, 'Confirm Password must be at least 6 characters long'),
   })
   .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
   });

const emailRegisterProcedure = publicProcedure
   .input(EmailReisterInputSchema)
   .mutation(async ({ input, ctx }) => {
      const { username, email, password } = input;

      const redis = useRedis();
      const blocked = await redis.get('register:blocked:' + email);
      if (blocked) {
         throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Too many failed attempts. Please try again later.',
         });
      }

      // 要求先通过邮箱验证码校验，防止绕过验证直接注册
      const verified = await redis.get('email_verified:' + email);
      if (!verified) {
         throw new TRPCError({
            code: 'FORBIDDEN',
            message: '请先完成邮箱验证码校验',
         });
      }

      const pwdHash = await hashPassword(password);

      const { userId } = await prisma.auth.create({
         data: {
            provider: 'EMAIL',
            providerId: email,
            password: pwdHash,
            email,
            user: {
               create: {
                  name: username,
                  displayName: username,
                  email: email,
                  UserStatistic: {},
               },
            },
         },
      });
      const tokens = generateTokens({ userId, role: 'USER' });
      const csrfToken = crypto.randomUUID();

      // 验证标记一次性使用
      await redis.del('email_verified:' + email);

      const refreshOpt = identityCookieOptions(tokens.refreshToken);
      setCookie(ctx.event, 'quanta_access_token', tokens.accessToken, identityCookieOptions(tokens.accessToken));
      setCookie(ctx.event, 'quanta_refresh_token', tokens.refreshToken, refreshOpt);
      setCookie(ctx.event, 'quanta_csrf_token', csrfToken, refreshOpt);

      return {
         csrfToken,
         user: {
            name: username,
            displayName: username,
            id: userId,
            email,
         },
      };
   });

// 使用已有用户名注册
const ExistingUserRegisterInputSchema = z.object({
   username: z.string(),
});

const existingUserRegisterProcedure = publicProcedure
   .input(ExistingUserRegisterInputSchema)
   .query(async ({ input }) => {
      const { username } = input;

      const existingUser = await prisma.user.findUnique({
         where: { name: username },
      });

      return { exists: !!existingUser };
   });

// 使用已有邮箱注册
const ExistingEmailRegisterInputSchema = z.object({
   email: z.string(),
});

const existingEmailRegisterProcedure = publicProcedure
   .input(ExistingEmailRegisterInputSchema)
   .query(async ({ input }) => {
      const { email } = input;

      const redis = useRedis();
      const blocked = await redis.get('register:blocked:' + email);
      if (blocked) {
         throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Too many failed attempts. Please try again later.',
         });
      }

      const existingAuth = await prisma.auth.findUnique({
         where: {
            provider_providerId: { provider: 'EMAIL', providerId: email },
         },
      });

      return { exists: !!existingAuth };
   });

// 验证验证码
const VerifyCodeInputSchema = z.object({
   email: z.email(),
   code: z.string().regex(/^\d{4}$/, 'Code must be a 4-digit number'),
});

const verifyCodeProcedure = publicProcedure
   .input(VerifyCodeInputSchema)
   .mutation(async ({ input }) => {
      const { email, code } = input;

      const redis = useRedis();
      const storedCode = await redis.get('verify_code:' + email);

      if (storedCode !== code) {
         const failedTime = await redis.incr('register:failed:' + email);
         // 如果失败次数超过5次，删除验证码；如果超过15次，禁止注册10分钟
         if (failedTime >= 5) {
            await redis.del('verify_code:' + email);
            throw new TRPCError({
               code: 'BAD_REQUEST',
               message: '失败次数过多，验证码已失效，请重新获取',
            });
         } else if (failedTime >= 15) {
            await redis.setex('register:blocked:' + email, '1', 10 * 60);
            throw new TRPCError({
               code: 'FORBIDDEN',
               message: '失败次数过多，注册已被禁止，请10分钟后再试',
            });
         }

         return { success: false };
      }

      await redis.del('verify_code:' + email);
      // 记录"该邮箱已验证成功"，供注册接口校验；
      // 否则可直接调用 register.email 跳过邮箱验证完成注册。
      await redis.setex('email_verified:' + email, 15 * 60, '1');

      return { success: true };
   });

export const registerRouter = router({
   email: emailRegisterProcedure,
   existingUser: existingUserRegisterProcedure,
   existingEmail: existingEmailRegisterProcedure,
   verifyCode: verifyCodeProcedure,
});
