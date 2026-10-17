import { Hono } from 'hono'
import { z } from 'zod'
import { config } from '../config.ts'
import { pushFrontendLog } from '../loki.ts'
import {
   frontendApiDurationSeconds,
   frontendApiRequestsTotal,
   frontendClsScore,
   frontendErrorsTotal,
   frontendWebVitalsSeconds,
} from '../metrics.ts'

// ---------- SDK 上报事件模型 ----------
// { kind: 'error', type: 'js'|'promise'|'resource', message, stack?, source?, lineno?, colno?, path? }
// { kind: 'api',   method, url, status?, duration?, ok }
// { kind: 'perf',  path?, metrics: { lcp?, fcp?, ttfb?, inp?, cls? } }

const errorEvent = z.object({
   kind: z.literal('error'),
   type: z.enum(['js', 'promise', 'resource']),
   message: z.string().min(1).max(2000),
   stack: z.string().max(4000).optional(),
   source: z.string().max(512).optional(),
   lineno: z.number().int().nonnegative().optional(),
   colno: z.number().int().nonnegative().optional(),
   path: z.string().max(256).optional(),
})

const apiEvent = z.object({
   kind: z.literal('api'),
   method: z.string().min(1).max(16),
   url: z.string().max(512),
   status: z.number().int().min(100).max(599).optional(),
   duration: z.number().nonnegative().finite().optional(),
   ok: z.boolean(),
})

const perfValue = z.number().nonnegative().finite().max(3600)
const perfEvent = z.object({
   kind: z.literal('perf'),
   path: z.string().max(256).optional(),
   metrics: z.object({
      lcp: perfValue.optional(),
      fcp: perfValue.optional(),
      ttfb: perfValue.optional(),
      inp: perfValue.optional(),
      cls: perfValue.optional(),
   }).refine(m => Object.keys(m).length > 0, { message: 'metrics 不能为空' }),
})

const reportSchema = z.object({
   app: z.string().min(1).max(64),
   release: z.string().max(64).optional(),
   events: z.array(z.discriminatedUnion('kind', [errorEvent, apiEvent, perfEvent])).min(1).max(100),
})

function statusClass(status: number | undefined): string {
   if (status === undefined)
      return 'network_error'
   if (status >= 500)
      return '5xx'
   if (status >= 400)
      return '4xx'
   if (status >= 300)
      return '3xx'
   return '2xx'
}

export const reportRoutes = new Hono()

// 鉴权：设置 OBS_REPORT_TOKEN 时要求 x-obs-token 匹配
reportRoutes.use('*', async (c, next) => {
   if (config.reportToken) {
      const provided = c.req.header('x-obs-token') ?? ''
      if (provided !== config.reportToken)
         return c.text('unauthorized', 401)
   }
   await next()
})

reportRoutes.post('/', async (c) => {
   let body: unknown
   try {
      body = await c.req.json()
   }
   catch {
      return c.text('invalid json', 400)
   }

   const parsed = reportSchema.safeParse(body)
   if (!parsed.success)
      return c.text(`invalid payload: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`, 400)

   const { app, release, events } = parsed.data

   for (const event of events) {
      if (event.kind === 'error') {
         frontendErrorsTotal.inc({ app, type: event.type })
         pushFrontendLog(
            app,
            event.type,
            JSON.stringify({
               ...event,
               release,
               ts: new Date().toISOString(),
               user_agent: c.req.header('user-agent') ?? '',
            }),
         )
      }
      else if (event.kind === 'api') {
         const cls = statusClass(event.status)
         frontendApiRequestsTotal.inc({ app, status: cls })
         if (event.duration !== undefined)
            frontendApiDurationSeconds.observe({ app }, event.duration / 1000)
      }
      else {
         for (const [metric, value] of Object.entries(event.metrics)) {
            if (metric === 'cls')
               frontendClsScore.observe({ app }, value)
            else
               frontendWebVitalsSeconds.observe({ app, metric }, value)
         }
      }
   }

   return c.body(null, 204)
})
