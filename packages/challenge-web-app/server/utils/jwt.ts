import { UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';
import prisma from '~~/lib/prisma';

export interface ITokenPayload {
   userId: string;
   role: UserRole;
}

/**
 * 读取运行时密钥。
 *
 * 为什么不能只依赖 useRuntimeConfig()：nuxt.config 在**构建期**执行，其 process.env 的值会被
 * 烤进 runtimeConfig，容器启动时注入的 ACCESS_TOKEN_SECRET 覆盖不了它（只有 NUXT_ 前缀的
 * 变量名才能覆盖，而本仓库统一使用真实变量名，见 nuxt.config.ts 顶部说明）。
 * 因此这里以 process.env 为准，runtimeConfig 仅作兜底；缺失时的拦截见
 * server/plugins/validate-secrets.ts。
 */
const runtimeSecret = (envKey: string, fallback?: string) =>
   process.env[envKey] || fallback || '';

/**
 * 生成双 token
 */
export const generateTokens = (payload: ITokenPayload) => {
   const {
      accessToken: accessTokenFallback,
      refreshToken: refreshTokenFallback,
      accessTokenExpiresIn,
      refreshTokenExpiresIn,
   } = useRuntimeConfig().secret;

   const accessSecret = runtimeSecret('ACCESS_TOKEN_SECRET', accessTokenFallback);
   const refreshSecret = runtimeSecret('REFRESH_TOKEN_SECRET', refreshTokenFallback);

   const refreshToken = jwt.sign(payload, refreshSecret, {
      algorithm: 'HS256',
      expiresIn: refreshTokenExpiresIn as any,
   });
   const accessToken = jwt.sign(payload, accessSecret, {
      algorithm: 'HS256',
      expiresIn: accessTokenExpiresIn as any,
   });

   return { accessToken, refreshToken };
};

/**
 * 滑动续签 token
 */
/**
 * 滑动续签 token
 *
 * 角色以**数据库**为准，而不是直接沿用旧 refresh token 里的角色：
 * 否则管理员被降权/删号后，只要还在用应用（access token 一过期就来续签），
 * 就会把旧角色一直续签下去，“切换权限”事实上永远不生效。
 * 代价是每次续签多一次主键查询（每人约 15 分钟一次，可接受）。
 */
export const renewTokens = async (refreshToken: string) => {
   const refreshSecret = runtimeSecret(
      'REFRESH_TOKEN_SECRET',
      useRuntimeConfig().secret.refreshToken,
   );

   try {
      const payload = jwt.verify(refreshToken, refreshSecret) as ITokenPayload;

      const user = await prisma.user.findUnique({
         where: { id: payload.userId },
         select: { role: true },
      });
      if (!user) {
         throw new Error('User no longer exists');
      }

      return generateTokens({
         role: user.role,
         userId: payload.userId,
      });
   } catch (error) {
      throw new Error('Invalid or expired refresh token');
   }
};

/**
 * 验证 access token
 */
export const verifyToken = (accessToken: string) => {
   const accessSecret = runtimeSecret(
      'ACCESS_TOKEN_SECRET',
      useRuntimeConfig().secret.accessToken,
   );
   try {
      return jwt.verify(accessToken, accessSecret) as ITokenPayload;
   } catch (error) {
      throw new Error('Invalid or expired access token');
   }
};
