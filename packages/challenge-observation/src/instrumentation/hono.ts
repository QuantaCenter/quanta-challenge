import type { MiddlewareHandler } from 'hono'
import client from 'prom-client'

export interface ApiInstrumentationOptions {
   /** 服务名，作为 service 标签 */
   service: string
   /** 自定义 registry（默认全局） */
   registry?: client.Registry
   /** 延迟直方图分桶（秒） */
   buckets?: number[]
}

const DEFAULT_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

export function createApiInstrumentation(options: ApiInstrumentationOptions) {
   const registry = options.registry ?? client.register
   const labels = { service: options.service }

   // 幂等注册：避免 HMR 重载时同名指标重复注册
   const requests =
      (registry.getSingleMetric('http_requests_total') as client.Counter | undefined) ??
      new client.Counter({
         name: 'http_requests_total',
         help: 'HTTP 请求总数',
         labelNames: ['service', 'route', 'method', 'status'] as const,
         registers: [registry],
      })

   const duration =
      (registry.getSingleMetric('http_request_duration_seconds') as client.Histogram | undefined) ??
      new client.Histogram({
         name: 'http_request_duration_seconds',
         help: 'HTTP 请求耗时（秒）',
         labelNames: ['service', 'route', 'method'] as const,
         buckets: options.buckets ?? DEFAULT_BUCKETS,
         registers: [registry],
      })

   const middleware: MiddlewareHandler = async (c, next) => {
      const start = performance.now()
      try {
         await next()
      } finally {
         const routeLabels = { ...labels, route: c.req.routePath, method: c.req.method }
         requests.inc({ ...routeLabels, status: String(c.res?.status ?? 500) })
         duration.observe(routeLabels, (performance.now() - start) / 1000)
      }
   }

   const metricsHandler: MiddlewareHandler = async (c) => {
      c.header('content-type', registry.contentType)
      return c.body(await registry.metrics())
   }

   return { middleware, metricsHandler, registry }
}
