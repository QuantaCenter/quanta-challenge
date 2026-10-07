import { verifyToken } from '~~/server/utils/jwt';
import { createDeviceFlowService } from '~~/server/services/device-flow';
import { formatUserCode } from '@challenge/shared/oauth';

/**
 * 返回指定 user_code 对应的待确认设备会话。
 *
 * ⚠️ 这是**只读**接口，但仍然要求登录：
 * 确认页需要展示"是哪个账号在授权"，未登录时会话无从谈起；
 * 同时它会对不存在/非法的 user_code 计一次失败尝试（RFC 8628 §5.1 的限速要求），
 * 因此不能让匿名请求随意调用。
 */
export default defineEventHandler(async (event) => {
   const token = getCookie(event, 'quanta_access_token');
   const user = token ? safeVerify(token) : null;
   if (!user) {
      setResponseStatus(event, 401);
      return { error: 'unauthorized' };
   }

   const query = getQuery(event);
   const userCode = typeof query.user_code === 'string' ? query.user_code : '';
   if (!userCode) {
      setResponseStatus(event, 400);
      return { error: 'invalid_request', error_description: 'user_code is required' };
   }

   const service = createDeviceFlowService();
   const session = await service.findByUserCode(userCode);

   if (!session) {
      // 查不到：按 RFC §5.1 记一次失败尝试，返回剩余次数。
      // 不区分"码不存在"与"码格式非法"，避免用错误差异缩小爆破空间。
      const remaining = await service.registerFailedAttempt(userCode);
      if (remaining <= 0) {
         setResponseStatus(event, 429);
         return {
            error: 'too_many_attempts',
            error_description: '验证码尝试次数过多，请回到终端重新发起',
         };
      }
      setResponseStatus(event, 404);
      return {
         error: 'not_found',
         error_description: '验证码不存在或已过期',
         attempts_remaining: remaining,
      };
   }

   return {
      // 返回**展示格式**（带中间横线，如 WDJB-MJHT）：
      // session.userCode 存的是归一化后的值（WDJBMJHT），直接返回会让确认页
      // 显示成不带横线的码，而终端上显示的是带横线的 —— 用户要逐字对比
      // 这两个地方，格式不一致会让人怀疑自己看错了（RFC §5.4 要求用户核对）。
      // 归一化只用于存储与比较，不应该泄露到展示层。
      user_code: formatUserCode(session.userCode),
      client_id: session.clientId,
      scope: session.scope,
      status: session.status,
      created_at: session.createdAt,
   };
});

const safeVerify = (token: string) => {
   try {
      return verifyToken(token);
   } catch {
      return null;
   }
};
