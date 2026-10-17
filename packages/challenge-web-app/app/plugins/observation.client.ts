import { initObservation } from '@challenge/observation/sdk';

/**
 * 前端监控接入（仅客户端执行）。
 *
 * 采集内容见 @challenge/observation/src/sdk：
 *  - JS 异常 / 未捕获 Promise 拒绝 / 资源加载失败；
 *  - Web Vitals（LCP / FCP / TTFB / INP / CLS）；
 *  - fetch + XHR 包装的 API 请求追踪（默认只追踪同源请求）。
 *
 * 事件批量上报到 runtimeConfig.public.observation.endpoint（默认
 * /api/observation/report，由 Nitro 服务端转发到 observation 采集服务）。
 */
export default defineNuxtPlugin(() => {
   const { observation } = useRuntimeConfig().public;

   if (!observation.endpoint)
      return;

   initObservation({
      endpoint: observation.endpoint,
      app: 'challenge-web-app',
      release: observation.release || undefined,
      token: observation.token || undefined,
      sampleRate: observation.sampleRate,
   });
});
