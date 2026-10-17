import type { ServerResponse } from 'node:http';
import { getServerMetrics, normalizeRouteLabel } from '../utils/metrics';

const SERVICE = 'challenge-web-app';

/**
 * Nitro 服务端 HTTP 指标埋点。
 *
 * Nitro 中间件在所有路由（含 /api、页面 SSR、静态资源）之前执行；
 * 这里记录开始时间，在 Node ServerResponse 的 'finish' 事件里
 * 拿到真实状态码后累加指标。/metrics 自身与 /_nuxt 静态资源跳过，
 * 避免自引用与噪音。
 *
 * Prometheus 通过 challenge-observation 的 backends.json 抓取 /metrics。
 */
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
