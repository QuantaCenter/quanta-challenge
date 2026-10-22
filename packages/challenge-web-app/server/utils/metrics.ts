import client from 'prom-client';

/** Nitro 服务端指标（单例，用 globalThis 防 dev 下二次注册报错）：与后端 Hono 服务保持同名指标，Grafana Dashboard 可直接复用。 */
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

/** 归一化路由标签避免高基数：数字/长 hex/UUID 段折叠成 :id，有界枚举保留原文。 */
export function normalizeRouteLabel(path: string): string {
   const clean = (path || '/').split('?')[0] ?? '/';
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
