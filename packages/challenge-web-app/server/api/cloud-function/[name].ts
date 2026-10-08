import { verifyToken } from '~~/server/utils/jwt';
import { resolveCloudFunctionToken } from '~~/server/utils/cloud-function-token';
import {
   CloudFunctionClientError,
   callCloudFunctionService,
} from '~~/server/utils/cloud-function-client';
import { logger } from '~~/lib/logger';

/**
 * 面向「用户代码」的云函数调用入口。
 *
 * 用户代码直接请求平台的**完整地址**（做题预览页与判题环境里的页面完全一样），
 * 带上做题页「云函数调用凭证」里给出的令牌：
 *   fetch('http://localhost:3000/api/cloud-function/daily-bonus', {
 *     method: 'POST',
 *     headers: {
 *       'content-type': 'application/json',
 *       authorization: 'Bearer <云函数调用令牌>',
 *     },
 *     body: JSON.stringify({ input }),
 *   })
 * 平台页面也可以用登录 cookie 同源调用。
 *
 * 身份最终由服务端代签转发给云函数服务（浏览器永远拿不到内部密钥）。
 * 与平台页面用的 `protected.cloudFunction.invoke`（tRPC）是两个入口。
 */
export default defineEventHandler(async (event) => {
   // CORS：用户代码在做题预览页 / 判题页面里对平台是**跨源**请求，用 Bearer 令牌
   // （不用 cookie），因此回显 Origin、但**不允许 credentials**。
   const origin = getHeader(event, 'origin');
   if (origin) {
      setHeader(event, 'access-control-allow-origin', origin);
      setHeader(event, 'vary', 'Origin');
      setHeader(event, 'access-control-allow-methods', 'POST, OPTIONS');
      setHeader(
         event,
         'access-control-allow-headers',
         'authorization, content-type',
      );
      setHeader(event, 'access-control-max-age', 600);
   }
   // challenge 页面处于 COEP require-corp 下，跨源资源需要显式放行。
   setHeader(event, 'cross-origin-resource-policy', 'cross-origin');

   if (event.method === 'OPTIONS') {
      setResponseStatus(event, 204);
      return '';
   }

   if (event.method !== 'POST') {
      throw createError({ statusCode: 405, message: '只支持 POST' });
   }

   const name = getRouterParam(event, 'name');
   if (!name) {
      throw createError({ statusCode: 400, message: '缺少函数名' });
   }

   // CSRF 防护：只接受 JSON 请求体。跨站表单发不出 application/json；跨站 fetch
   // 发 JSON 会触发预检，而本接口只在带 Origin 时回显允许头、且不允许 credentials。
   const contentType = getHeader(event, 'content-type') ?? '';
   if (!contentType.includes('application/json')) {
      throw createError({
         statusCode: 415,
         message: 'Content-Type 必须是 application/json',
      });
   }

   // 身份来源一：用户代码带来的调用令牌（做题 / 判题环境）：短 token → Redis 里的 userId。
   // 身份来源二：登录 cookie（同源调用，例如平台页面）。
   let userId: string | null = null;
   const authorization = getHeader(event, 'authorization');
   if (authorization?.startsWith('Bearer ')) {
      userId = await resolveCloudFunctionToken(authorization.slice(7).trim());
   }
   if (!userId) {
      const cookie = getCookie(event, 'quanta_access_token');
      if (cookie) {
         try {
            userId = verifyToken(cookie).userId;
         } catch {
            userId = null;
         }
      }
   }
   if (!userId) {
      throw createError({ statusCode: 401, message: '未认证' });
   }

   const body = await readBody<{ input?: unknown }>(event).catch(() => null);
   const input =
      body && typeof body === 'object' && 'input' in body
         ? (body.input ?? null)
         : null;

   try {
      const data = await callCloudFunctionService<unknown>({
         method: 'POST',
         path: `/v1/invoke/${encodeURIComponent(name)}`,
         body: { input },
         userId,
         traceId: getHeader(event, 'x-trace-id') ?? undefined,
      });

      return { ok: true, data: data ?? null };
   } catch (error) {
      if (error instanceof CloudFunctionClientError) {
         logger.warn(
            { name, userId, code: error.code, message: error.message },
            '云函数调用失败',
         );
         setResponseStatus(event, error.status);
         return { ok: false, error: { code: error.code, message: error.message } };
      }
      throw error;
   }
});
