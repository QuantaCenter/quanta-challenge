import { UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';
import prisma from '~~/lib/prisma';

export interface ITokenPayload {
   userId: string;
   role: UserRole;
}

/** 读取运行时密钥：以 process.env 为准（nuxt.config 在构建期执行，烤进 runtimeConfig 的值会被环境变量覆盖不了），缺失拦截见 validate-secrets.ts。 */
const runtimeSecret = (envKey: string, fallback?: string) =>
   process.env[envKey] || fallback || '';

/** 生成双 token */
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

/** 滑动续签 token：角色以数据库为准（避免降权后旧角色被一直续签），代价是每次续签多一次主键查询。 */
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
