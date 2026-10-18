import { logger } from '~~/server/utils/logger';

export default defineEventHandler(async (event) => {
   const refreshToken = getCookie(event, 'quanta_refresh_token');

   if (!refreshToken) {
      setResponseStatus(event, 401);
      return { error: 'Unauthorized' };
   }

   try {
      const tokens = await renewTokens(refreshToken);

      // 设置新的 cookie
      const opt = {
         httpOnly: true,
         secure: process.env.NODE_ENV === 'production',
         sameSite: 'lax' as const,
      };

      setCookie(event, 'quanta_access_token', tokens.accessToken, opt);
      setCookie(event, 'quanta_refresh_token', tokens.refreshToken, opt);

      setResponseStatus(event, 200);
      return tokens;
   } catch (error: any) {
      logger.error({ error }, 'Error renewing tokens');
      setResponseStatus(event, 401);
      return { error: 'Invalid refresh token' };
   }
});
