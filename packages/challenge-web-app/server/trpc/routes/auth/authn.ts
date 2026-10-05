import prisma from '~~/lib/prisma';
import { protectedProcedure } from '../../protected-trpc';
import { publicProcedure, router } from '../../trpc';
import z from 'zod';
import * as serverAuthn from '@simplewebauthn/server';
import { TRPCError } from '@trpc/server';
import type { H3Event } from 'h3';
import { logger } from '~~/lib/logger';

/**
 * WebAuthn 的 RP ID 与 expectedOrigin 必须和用户实际访问的站点一致，
 * 否则浏览器在 `navigator.credentials.create()` 阶段就会直接抛
 * SecurityError / NotAllowedError（请求根本到不了 verifyRegistration）。
 *
 * 旧实现把两者写死成 `localhost` / `http://localhost:3000`，只在本地开发可用；
 * 线上域名是 challenge.quantacenter.com，因此注册必然失败。
 *
 * 这里改为：
 *   1. 优先取请求的 Origin 头（同源 POST 会带上）；
 *   2. 退回到 runtimeConfig 里的 APP_SERVER；
 *   3. 再退回到 Host + x-forwarded-proto。
 * rpID 取 origin 的 hostname，localStorage/HTTPS 两种环境都自洽。
 */
const resolveWebAuthnContext = (event: H3Event) => {
   const config = useRuntimeConfig();
   const configuredOrigin = String(
      config.public?.appBaseUrl ?? '',
   ).replace(/\/+$/, '');

   const originHeader = getHeader(event, 'origin');
   const referer = getHeader(event, 'referer');
   const host = getHeader(event, 'host');
   const proto = getHeader(event, 'x-forwarded-proto') ?? 'https';

   let origin = originHeader || configuredOrigin;
   if (!origin && referer) {
      try {
         origin = new URL(referer).origin;
      } catch {
         // ignore malformed referer
      }
   }
   if (!origin && host) {
      origin = `${proto}://${host}`;
   }
   origin = (origin || 'http://localhost:3000').replace(/\/+$/, '');

   let rpID = 'localhost';
   try {
      rpID = new URL(origin).hostname;
   } catch {
      // ignore malformed origin, keep localhost fallback
   }

   return { rpID, origin };
};

/** 把 options 与本次校验上下文一起放进 Redis，验证时复用同一份 rpID/origin。 */
const WEB_AUTHN_OPTIONS_TTL_SECONDS = 300;

// 注册 WebAuthn 验证器
const registerAuthnProcedure = protectedProcedure.mutation(async ({ ctx }) => {
   const { userId } = ctx.user;
   const { rpID, origin } = resolveWebAuthnContext(ctx.event);

   const user = await prisma.user.findUniqueOrThrow({
      where: {
         id: userId,
      },
      include: {
         WebAuthnCredential: true,
      },
   });

   const options = await serverAuthn.generateRegistrationOptions({
      rpID,
      rpName: 'Quanta Challenge',
      userName: user.name || user.email,
      attestationType: 'none',
      excludeCredentials: user.WebAuthnCredential.map((cred) => ({
         id: cred.id,
      })),
   });

   const redis = useRedis();
   await redis.set(
      'webauthn:register:' + userId,
      JSON.stringify({ options, rpID, origin }),
      'EX',
      WEB_AUTHN_OPTIONS_TTL_SECONDS,
   );

   return options;
});

// 验证注册结果
const VerifyRegistrationSchema = z.looseObject({
   id: z.string(),
   rawId: z.string(),
});

const verifyAuthnRegistrationProcedure = protectedProcedure
   .input(VerifyRegistrationSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      const redis = useRedis();
      const storedJSON = await redis.get('webauthn:register:' + userId);
      if (!storedJSON) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No registration options found',
         });
      }
      redis.del('webauthn:register:' + userId);

      const stored = JSON.parse(storedJSON);
      // 兼容旧格式（历史数据里直接存了 options 本体）
      const options: serverAuthn.PublicKeyCredentialCreationOptionsJSON =
         stored.options ?? stored;
      const fallback = resolveWebAuthnContext(ctx.event);
      const rpID: string = stored.rpID ?? fallback.rpID;
      const origin: string = stored.origin ?? fallback.origin;

      let verification: Awaited<
         ReturnType<typeof serverAuthn.verifyRegistrationResponse>
      >;
      try {
         verification = await serverAuthn.verifyRegistrationResponse({
            response: input as any,
            expectedChallenge: options.challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
         });
      } catch (error) {
         logger.error(
            { error, userId, rpID, origin, traceId: ctx.traceId },
            'WebAuthn registration verification threw',
         );
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'WebAuthn registration verification failed',
         });
      }

      const { registrationInfo } = verification;
      if (!verification.verified || !registrationInfo) {
         logger.warn(
            { userId, rpID, origin, traceId: ctx.traceId },
            'WebAuthn registration verification returned verified=false',
         );
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'WebAuthn registration verification failed',
         });
      }

      const { credential } = registrationInfo;
      await prisma.webAuthnCredential.create({
         data: {
            publicKey: Buffer.from(credential.publicKey).toString('base64'),
            id: credential.id,
            counter: credential.counter,
            transport: credential.transports?.join(';'),
            user: {
               connect: {
                  id: userId,
               },
            },
         },
      });

      const tokens = generateTokens({ userId, role: 'USER' });
      const csrfToken = crypto.randomUUID();

      const opt = {
         httpOnly: true,
         secure: process.env.NODE_ENV === 'production',
         sameSite: 'lax' as any,
      };
      setCookie(ctx.event, 'quanta_access_token', tokens.accessToken, opt);
      setCookie(ctx.event, 'quanta_refresh_token', tokens.refreshToken, opt);
      setCookie(ctx.event, 'quanta_csrf_token', csrfToken, opt);

      return { csrfToken };
   });

// 验证 WebAuthn 登录
const AuthenticateAuthnSchema = z.object({
   email: z.email(),
});

const authenticateAuthnProcedure = publicProcedure
   .input(AuthenticateAuthnSchema)
   .mutation(async ({ input, ctx }) => {
      const { email } = input;
      const { rpID, origin } = resolveWebAuthnContext(ctx.event);

      const user = await prisma.user.findUniqueOrThrow({
         where: { email },
         include: { WebAuthnCredential: true },
      });

      if (user.WebAuthnCredential.length === 0) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No WebAuthn credentials found for this user',
         });
      }

      const options = await serverAuthn.generateAuthenticationOptions({
         rpID,
         allowCredentials: user.WebAuthnCredential.map((cred) => ({
            id: cred.id,
            transports: (cred.transport?.split(';') ||
               []) as serverAuthn.AuthenticatorTransport[],
            type: 'public-key',
         })),
      });

      const redis = useRedis();
      await redis.set(
         'webauthn:authenticate:' + email,
         JSON.stringify({ options, rpID, origin }),
         'EX',
         WEB_AUTHN_OPTIONS_TTL_SECONDS,
      );

      return options;
   });

// 验证 WebAuthn 登录结果
const VerifyAuthenticationSchema = z.object({
   accessResponse: z.looseObject({
      id: z.string(),
      rawId: z.string(),
   }),
   email: z.email(),
});

const verifyAuthnAuthenticationProcedure = publicProcedure
   .input(VerifyAuthenticationSchema)
   .mutation(async ({ input, ctx }) => {
      const redis = useRedis();
      const { accessResponse, email } = input;
      const storedJSON = await redis.get('webauthn:authenticate:' + email);
      if (!storedJSON) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No authentication options found',
         });
      }
      redis.del('webauthn:authenticate:' + email);

      const stored = JSON.parse(storedJSON);
      const options: serverAuthn.PublicKeyCredentialRequestOptionsJSON =
         stored.options ?? stored;
      const fallback = resolveWebAuthnContext(ctx.event);
      const rpID: string = stored.rpID ?? fallback.rpID;
      const origin: string = stored.origin ?? fallback.origin;

      const credential = await prisma.webAuthnCredential.findFirstOrThrow({
         where: {
            id: accessResponse.id,
         },
      });

      let verification: Awaited<
         ReturnType<typeof serverAuthn.verifyAuthenticationResponse>
      >;
      try {
         verification = await serverAuthn.verifyAuthenticationResponse({
            response: accessResponse as any,
            expectedChallenge: options.challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            requireUserVerification: true,
            credential: {
               id: credential.id,
               publicKey: Buffer.from(credential.publicKey, 'base64'),
               counter: credential.counter,
            },
         });
      } catch (error) {
         logger.error(
            { error, email, rpID, origin, traceId: ctx.traceId },
            'WebAuthn authentication verification threw',
         );
         throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'WebAuthn authentication verification failed',
         });
      }

      if (!verification.verified) {
         logger.warn(
            { email, rpID, origin, traceId: ctx.traceId },
            'WebAuthn authentication verification returned verified=false',
         );
         throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'WebAuthn authentication verification failed',
         });
      }

      // 更新签名计数器，帮助识别克隆的验证器
      await prisma.webAuthnCredential.update({
         where: { id: credential.id },
         data: {
            counter: verification.authenticationInfo.newCounter,
            lastUsed: new Date(),
         },
      });

      const user = await prisma.user.findUniqueOrThrow({
         where: { email },
         select: { id: true, role: true },
      });

      const tokens = generateTokens({
         userId: user.id,
         role: user.role,
      });
      const csrfToken = crypto.randomUUID();

      const opt = {
         httpOnly: true,
         secure: process.env.NODE_ENV === 'production',
         sameSite: 'lax' as any,
      };
      setCookie(ctx.event, 'quanta_access_token', tokens.accessToken, opt);
      setCookie(ctx.event, 'quanta_refresh_token', tokens.refreshToken, opt);
      setCookie(ctx.event, 'quanta_csrf_token', csrfToken, opt);

      return { csrfToken };
   });

// 查询是否已注册 WebAuthn 验证器
const checkAuthnRegisteredProcedure = protectedProcedure.query(
   async ({ ctx }) => {
      const { userId } = ctx.user;

      const credentials = await prisma.webAuthnCredential.findMany({
         where: {
            userId,
         },
      });

      return credentials.length > 0;
   },
);

export const authnRouter = router({
   register: registerAuthnProcedure,
   verifyRegistration: verifyAuthnRegistrationProcedure,
   authenticate: authenticateAuthnProcedure,
   verifyAuthentication: verifyAuthnAuthenticationProcedure,
});
