import client from 'prom-client';

/**
 * Nitro 服务端指标（单例）。
 *
 * 与后端 Hono 服务的 @challenge/observation/instrumentation 保持同名指标
 * （http_requests_total / http_request_duration_seconds），Grafana「后端 API」
 * Dashboard 与告警规则可以直接复用。
 *
 * 用 globalThis 挂单例：Nuxt dev 下插件/工具模块可能被重新执行，
 * prom-client 同名指标二次注册会抛 "already been registered"。
 */
interface ServerMetrics {
   registry: client.Registry;
   httpRequestsTotal: client.Counter;
   httpRequestDurationSeconds: client.Histogram;
}

const globalStore = globalThis as typeof globalThis & {
   __quantaServerMetrics?: ServerMetrics;
};

export function getServerMetrics(): ServerMetrics {
   if (!globalStore.__quantaServerMetrics) {
      const registry = new client.Registry();
      client.collectDefaultMetrics({ register: registry });

      globalStore.__quantaServerMetrics = {
         registry,
         httpRequestsTotal: new client.Counter({
            name: 'http_requests_total',
            help: 'Nitro 服务端 HTTP 请求总数',
            labelNames: ['service', 'route', 'method', 'status'] as const,
            registers: [registry],
         }),
         httpRequestDurationSeconds: new client.Histogram({
            name: 'http_request_duration_seconds',
            help: 'Nitro 服务端 HTTP 请求耗时（秒）',
            labelNames: ['service', 'route', 'method'] as const,
            buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
            registers: [registry],
         }),
      };
   }
   return globalStore.__quantaServerMetrics;
}

/**
 * 归一化路由标签，避免高基数：
 * 数字段 / 长 hex 段 / UUID 段统一折叠成 :id（题目 slug 等有界枚举保留原文）。
 */
export function normalizeRouteLabel(path: string): string {
   const clean = (path || '/').split('?')[0];
   const normalized = clean
      .split('/')
      .map((seg) => {
         if (!seg) return seg;
         if (/^\d+$/.test(seg)) return ':id';
         if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ':id';
         if (/^[0-9a-f]{12,}$/i.test(seg)) return ':id';
         return seg;
      })
      .join('/');
   return normalized || '/';
}
