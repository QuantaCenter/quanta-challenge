import type { MiddlewareHandler } from 'hono'
import client from 'prom-client'

// 后端 API 埋点（请求量/错误率/延迟）：
//   const api = createApiInstrumentation({ service: 'xxx' })
//   app.use('*', api.middleware)      // 业务路由之前
//   app.get('/metrics', api.metricsHandler)
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

   const requests = new client.Counter({
      name: 'http_requests_total',
      help: 'HTTP 请求总数',
      labelNames: ['service', 'route', 'method', 'status'] as const,
      registers: [registry],
   })

   const duration = new client.Histogram({
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
      }
      finally {
         const route = c.req.routePath
         const method = c.req.method
         const status = String(c.res?.status ?? 500)
         requests.inc({ ...labels, route, method, status })
         duration.observe({ ...labels, route, method }, (performance.now() - start) / 1000)
      }
   }

   const metricsHandler: MiddlewareHandler = async (c) => {
      c.header('content-type', registry.contentType)
      return c.body(await registry.metrics())
   }

   return { middleware, metricsHandler, registry }
}
