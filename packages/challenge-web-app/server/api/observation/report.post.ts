/**
 * 前端监控上报的同源代理。
 *
 * 为什么不让浏览器直连 observation 服务（127.0.0.1:9310）：
 *  - 生产环境 observation 只绑定回环地址，公网浏览器根本到不了；
 *  - 直连是跨源请求，需要给采集服务加 CORS 与额外反代。
 * 走本路由后 SDK 始终同源上报，服务端在 compose 网络内转发到
 * runtimeConfig.observation.serverUrl（生产为 http://observation:9310）。
 *
 * 代理失败时静默返回 502：监控上报绝不影响业务页面。
 */
export default defineEventHandler(async (event) => {
   const config = useRuntimeConfig(event);

   const body = await readRawBody(event, 'utf-8');
   if (!body) {
      setResponseStatus(event, 400);
      return null;
   }

   const headers: Record<string, string> = {
      'content-type': 'application/json',
   };
   // 与 observation 服务的 OBS_REPORT_TOKEN 对齐（可选）
   const token = process.env.OBSERVATION_REPORT_TOKEN;
   if (token) headers['x-obs-token'] = token;
   // 上报的 Loki 日志里带 user_agent，透传原始 UA
   const userAgent = getRequestHeader(event, 'user-agent');
   if (userAgent) headers['user-agent'] = userAgent;

   try {
      const res = await $fetch.raw(`${config.observation.serverUrl}/api/v1/report`, {
         method: 'POST',
         body,
         headers,
      });
      setResponseStatus(event, res.status);
      return null;
   }
   catch (error) {
      console.warn('[observation] 上报转发失败，本次批次已丢弃:', error);
      setResponseStatus(event, 502);
      return null;
   }
});
