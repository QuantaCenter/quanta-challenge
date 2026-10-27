import prisma from '~~/lib/prisma';
import z from 'zod';
import { publicProcedure, router } from '~~/server/trpc/trpc';
import { generateTokens } from '~~/server/utils/jwt';
import { identityCookieOptions } from '~~/server/utils/auth-cookies';
import { comparePassword } from '~~/server/utils/password';
import { limitRequest } from '~~/server/trpc/middlewares/limit-request';
import { protectedProcedure } from '../../protected-trpc';
import { TRPCError } from '@trpc/server';

const emailLoginInputSchema = z.object({
   email: z.email(),
   password: z.string().min(6, 'Password must be at least 6 characters long'),
});

const emailLoginProcedure = publicProcedure
   .use(limitRequest(10))
   .input(emailLoginInputSchema)
   .mutation(async ({ input, ctx }) => {
      const { email, password } = input;

      // 用 findFirst 而非 findFirstOrThrow：邮箱不存在时返回与密码错误一致的错误，
      // 避免通过错误差异枚举已注册邮箱。
      const authRecord = await prisma.auth.findFirst({
         where: {
            provider: 'EMAIL',
            providerId: email,
         },
      });
      const pwdHash = authRecord?.password;
      // 必须 await：comparePassword 是异步函数，漏掉 await 会让真值判断恒为通过
      if (!pwdHash || !(await comparePassword(password, pwdHash))) {
         throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid email or password',
         });
      }

      const user = await prisma.user.findUniqueOrThrow({
         where: { id: authRecord.userId },
         include: { avatar: true },
      });
      const tokens = generateTokens({
         userId: user.id,
         role: user.role,
      });
      const csrfToken = crypto.randomUUID();

      const refreshOpt = identityCookieOptions(tokens.refreshToken);
      setCookie(ctx.event, 'quanta_access_token', tokens.accessToken, identityCookieOptions(tokens.accessToken));
      setCookie(ctx.event, 'quanta_refresh_token', tokens.refreshToken, refreshOpt);
      // CSRF cookie 的生命周期跟随 refresh token，避免它比会话活得更久
      setCookie(ctx.event, 'quanta_csrf_token', csrfToken, refreshOpt);

      return { user, csrfToken };
   });

const getUserByAccessToken = protectedProcedure.query(async ({ ctx }) => {
   if (!ctx.user) {
      throw new TRPCError({
         code: 'UNAUTHORIZED',
         message: 'Unauthorized',
      });
   }
   const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.userId },
      include: { avatar: true },
   });
   prisma.user.update({
      where: { id: ctx.user.userId },
      data: {
         lastLogin: new Date(),
      },
   });

   return { user };
});

export const loginRouter = router({
   email: emailLoginProcedure,
   getUser: getUserByAccessToken,
});
