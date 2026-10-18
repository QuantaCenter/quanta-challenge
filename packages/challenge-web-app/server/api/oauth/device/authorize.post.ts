import {
   DEVICE_CODE_POLL_INTERVAL_SECONDS,
   DEVICE_FLOW_CLIENT_ID,
   DEVICE_FLOW_SCOPE,
} from '@challenge/shared/oauth';
import z from 'zod';

import { createDeviceFlowService } from '~~/server/services/device-flow';
import { logger } from '~~/lib/logger';

/** RFC 8628 §3.1 设备授权端点：未认证接口，只接受已知 client_id、响应只含随机码，限速由 oauth-device-rate-limit.ts 施加；请求体接受 form-urlencoded 与 JSON。 */
const BodySchema = z.object({
   client_id: z.string().min(1),
   scope: z.string().optional(),
});

export default defineEventHandler(async (event) => {
   const traceId = getHeader(event, 'x-trace-id') ?? 'unknown';

   // readBody 是泛型函数：显式给出 Record<string, unknown> 才能让下面的取属性通过类型检查。 不用 `.catch(() => ({}))`：它会把返回类型变成联合体（`Record | {}`）， 反而让每个字段访问都报“属性不存在”。解析失败交给 zod 报 invalid_request。
   const raw = await readBody<Record<string, unknown>>(event).catch(
      () => ({}) as Record<string, unknown>,
   );
   const parsed = BodySchema.safeParse({
      client_id: typeof raw.client_id === 'string' ? raw.client_id : undefined,
      scope: typeof raw.scope === 'string' ? raw.scope : undefined,
   });

   if (!parsed.success) {
      // RFC §3.2：设备授权端点的错误格式与令牌端点一致（RFC 6749 §5.2）
      setResponseStatus(event, 400);
      return {
         error: 'invalid_request',
         error_description: 'client_id is required',
      };
   }

   if (parsed.data.client_id !== DEVICE_FLOW_CLIENT_ID) {
      logger.warn({ traceId, clientId: parsed.data.client_id }, '未知的 OAuth 客户端');
      setResponseStatus(event, 400);
      return {
         error: 'invalid_client',
         error_description: `unknown client_id: ${parsed.data.client_id}`,
      };
   }

   const service = createDeviceFlowService();
   const issued = await service.authorize({
      clientId: parsed.data.client_id,
      scope: parsed.data.scope ?? DEVICE_FLOW_SCOPE,
   });

   const baseUrl = resolvePublicBaseUrl(event);

   // RFC §3.2 要求响应不可缓存：device_code 一旦被中间层缓存就会串会话
   setHeader(event, 'cache-control', 'no-store');
   setHeader(event, 'pragma', 'no-cache');

   logger.info(
      { traceId, clientId: parsed.data.client_id },
      '已签发设备授权码',
   );

   return {
      device_code: issued.deviceCode,
      user_code: issued.userCode,
      verification_uri: `${baseUrl}/auth/device`,
      // RFC §3.3.1：把 user_code 带进 URI，便于 CLI 直接打开浏览器并预填
      verification_uri_complete: `${baseUrl}/auth/device?user_code=${encodeURIComponent(issued.userCode)}`,
      expires_in: issued.expiresIn,
      interval: DEVICE_CODE_POLL_INTERVAL_SECONDS,
   };
});
