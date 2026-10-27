import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { config } from './config.ts'
import { alertRoutes } from './routes/alerts.ts'
import { configRoutes } from './routes/config.ts'
import { envelopeRoutes } from './routes/envelope.ts'
import { reportRoutes } from './routes/report.ts'
import { register } from './metrics.ts'
import { logger } from './logger.ts'

const app = new Hono()

// ---------- 管理接口鉴权（OBS_API_TOKEN） ----------
async function requireApiToken(c: Parameters<Parameters<Hono['use']>[1]>[0], next: () => Promise<void>) {
   if (!config.apiToken)
      return c.text('OBS_API_TOKEN is not configured, admin endpoints are disabled', 503)
   const provided = ((c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '')
      || c.req.header('x-obs-token')) ?? ''
   if (provided !== config.apiToken)
      return c.text('unauthorized', 401)
   await next()
}

app.get('/healthz', c => c.json({ ok: true, ts: new Date().toISOString() }))

// Prometheus 抓取入口
app.get('/metrics', async (c) => {
   c.header('content-type', register.contentType)
   return c.body(await register.metrics())
})

// 前端 SDK 上报
app.route('/api/v1/report', reportRoutes)

// Sentry Envelope 接收（@sentry/nuxt 前端经 tunnel 代理、Nitro 服务端按 DSN 直连）
app.route('/', envelopeRoutes)

// 业务配置与告警记录（SQLite）
app.use('/api/v1/config/*', requireApiToken)
app.use('/api/v1/alerts', requireApiToken)
app.use('/api/v1/alerts/*', requireApiToken)
app.route('/api/v1/config', configRoutes)
app.route('/api/v1/alerts', alertRoutes)

app.notFound(c => c.text('not found', 404))
app.onError((err, c) => {
   logger.error(err.stack ?? err.message)
   return c.text('internal error', 500)
})

serve({ fetch: app.fetch, port: config.port }, (info) => {
   logger.info(`listening on http://0.0.0.0:${info.port}`)
   logger.info(`db=${config.dbPath} loki=${config.lokiUrl}`)
})
