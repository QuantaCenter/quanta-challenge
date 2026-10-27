import type { ServerResponse } from 'node:http';
import { getServerMetrics, normalizeRouteLabel } from '../utils/metrics';

const SERVICE = 'challenge-web-app';

/** Nitro 服务端 HTTP 指标埋点：在 'finish' 事件里按真实状态码累加；/metrics 与 /_nuxt 跳过，由 observation 抓取。 */
export default defineEventHandler((event) => {
   const path = event.path ?? '';
   if (path === '/metrics' || path.startsWith('/_nuxt/')) return;

   const { httpRequestsTotal, httpRequestDurationSeconds } = getServerMetrics();
   const method = event.method;
   const route = normalizeRouteLabel(path);
   const start = performance.now();
   const res = event.node.res as ServerResponse;

   res.on('finish', () => {
      const status = String(res.statusCode);
      httpRequestsTotal.inc({ service: SERVICE, route, method, status });
      httpRequestDurationSeconds.observe(
         { service: SERVICE, route, method },
         (performance.now() - start) / 1000,
      );
   });
});
