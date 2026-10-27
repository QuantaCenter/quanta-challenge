import { logger } from '~~/server/utils/logger';
import { identityCookieOptions } from '~~/server/utils/auth-cookies';

export default defineEventHandler(async (event) => {
   const refreshToken = getCookie(event, 'quanta_refresh_token');

   if (!refreshToken) {
      setResponseStatus(event, 401);
      return { error: 'Unauthorized' };
   }

   try {
      const tokens = await renewTokens(refreshToken);

      // 设置新的 cookie（带 Max-Age，滑动续期）
      setCookie(event, 'quanta_access_token', tokens.accessToken, identityCookieOptions(tokens.accessToken));
      setCookie(event, 'quanta_refresh_token', tokens.refreshToken, identityCookieOptions(tokens.refreshToken));

      setResponseStatus(event, 200);
      return tokens;
   } catch (error: any) {
      logger.error({ error }, 'Error renewing tokens');
      setResponseStatus(event, 401);
      return { error: 'Invalid refresh token' };
   }
});
