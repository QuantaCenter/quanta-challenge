/** Sentry envelope 的同源 tunnel 代理：observation 只绑回环地址且避免 CORS；代理失败静默返回 502，监控上报绝不影响业务页面。 */
export default defineEventHandler(async (event) => {
   const config = useRuntimeConfig(event);

   const body = await readRawBody(event, 'utf-8');
   if (!body) {
      setResponseStatus(event, 400);
      return null;
   }

   const headers: Record<string, string> = {
      // envelope 的 content-type（application/x-sentry-envelope）原样透传
      'content-type': getRequestHeader(event, 'content-type') ?? 'application/x-sentry-envelope',
   };
   // 与 observation 服务的 OBS_REPORT_TOKEN 对齐（可选）
   const token = process.env.OBSERVATION_REPORT_TOKEN;
   if (token) headers['x-obs-token'] = token;
   // 采集侧 Loki 日志里带 user_agent，透传原始 UA
   const userAgent = getRequestHeader(event, 'user-agent');
   if (userAgent) headers['user-agent'] = userAgent;

   try {
      const res = await $fetch.raw(`${config.observation.serverUrl}/api/1/envelope/`, {
         method: 'POST',
         body,
         headers,
      });
      setResponseStatus(event, res.status);
      return null;
   }
   catch (error) {
      console.warn('[sentry-tunnel] envelope 转发失败，本次已丢弃:', error);
      setResponseStatus(event, 502);
      return null;
   }
});
