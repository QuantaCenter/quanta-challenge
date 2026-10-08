import { verifyToken } from '~~/server/utils/jwt';
import { issueCloudFunctionToken } from '~~/server/utils/cloud-function-token';

/**
 * 用当前登录会话换一个「云函数调用令牌」（短 token，服务端 Redis 保存 token → userId）。
 *
 * 只能由已登录用户获取。
 */
export default defineEventHandler(async (event) => {
   const cookie = getCookie(event, 'quanta_access_token');
   if (!cookie) {
      throw createError({ statusCode: 401, message: '未登录' });
   }

   let userId: string;
   try {
      userId = verifyToken(cookie).userId;
   } catch {
      throw createError({ statusCode: 401, message: '登录态无效或已过期' });
   }

   return {
      ok: true,
      data: { token: await issueCloudFunctionToken(userId) },
   };
});
