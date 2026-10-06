import { UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';

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
export const renewTokens = (refreshToken: string) => {
   const refreshSecret = runtimeSecret(
      'REFRESH_TOKEN_SECRET',
      useRuntimeConfig().secret.refreshToken,
   );

   try {
      const payload = jwt.verify(refreshToken, refreshSecret) as ITokenPayload;
      return generateTokens({
         role: payload.role,
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
