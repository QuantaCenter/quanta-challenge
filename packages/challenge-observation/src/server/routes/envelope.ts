import { Hono } from 'hono'
import type { Context } from 'hono'
import { config } from '../config.ts'
import { pushFrontendLog } from '../loki.ts'
import { frontendErrorsTotal } from '../metrics.ts'
import { consumePerformance, isRecord } from '../sentry/performance.ts'

/** Sentry Envelope 接收端点：浏览器经 tunnel 代理、服务端按 DSN 直连；DSN 的 publicKey 即 app 标识。 */

interface EnvelopeItem {
   type: string
   payload: string
}

function readLine(buf: Buffer, start: number): { line: string; next: number } | null {
   if (start >= buf.length)
      return null
   const idx = buf.indexOf(0x0a, start)
   const end = idx === -1 ? buf.length : idx
   return { line: buf.subarray(start, end).toString('utf8').replace(/\r$/, ''), next: end + 1 }
}

/** 从 DSN（http://key@host:port/projectId）提取 publicKey 作为 app 标识 */
function appFromDsn(dsn: unknown): string | undefined {
   if (typeof dsn !== 'string')
      return undefined
   const match = /^[a-z+]+:\/\/([^@]+)@/i.exec(dsn)
   return match?.[1] || undefined
}

function parseEnvelope(buf: Buffer): { dsn?: unknown; items: EnvelopeItem[] } | null {
   const first = readLine(buf, 0)
   if (!first)
      return null
   let header: { dsn?: unknown }
   try {
      header = JSON.parse(first.line)
   }
   catch {
      return null
   }

   const items: EnvelopeItem[] = []
   let offset = first.next

   while (offset < buf.length) {
      const itemHeaderLine = readLine(buf, offset)
      if (!itemHeaderLine)
         break
      offset = itemHeaderLine.next
      if (!itemHeaderLine.line)
         continue

      let itemHeader: { type?: string; length?: number }
      try {
         itemHeader = JSON.parse(itemHeaderLine.line)
      }
      catch {
         continue
      }

      let payload: Buffer
      if (typeof itemHeader.length === 'number' && itemHeader.length >= 0) {
         payload = buf.subarray(offset, offset + itemHeader.length)
         offset += itemHeader.length
         // 定长载荷后如紧跟换行则跳过
         if (buf[offset] === 0x0a)
            offset += 1
      }
      else {
         const payloadLine = readLine(buf, offset)
         if (!payloadLine)
            break
         payload = Buffer.from(payloadLine.line, 'utf8')
         offset = payloadLine.next
      }

      if (itemHeader.type)
         items.push({ type: itemHeader.type, payload: payload.toString('utf8') })
   }

   return { dsn: header.dsn, items }
}

export const envelopeRoutes = new Hono()

// 鉴权：设置 OBS_REPORT_TOKEN 时要求 x-obs-token 匹配；内网 Sentry SDK 直连带 X-Sentry-Auth 头的请求放行。
envelopeRoutes.use('*', async (c, next) => {
   if (config.reportToken && !c.req.header('x-sentry-auth')) {
      const provided = c.req.header('x-obs-token') ?? ''
      if (provided !== config.reportToken)
         return c.text('unauthorized', 401)
   }
   await next()
})

async function handleEnvelope(c: Context) {
   const raw = Buffer.from(await c.req.arrayBuffer())
   if (raw.length === 0)
      return c.text('empty envelope', 400)

   const envelope = parseEnvelope(raw)
   if (!envelope)
      return c.text('invalid envelope', 400)

   const app = appFromDsn(envelope.dsn) ?? c.req.param('projectId') ?? 'unknown'
   for (const item of envelope.items) {
      if (!['event', 'transaction', 'span'].includes(item.type) || !item.payload)
         continue

      let payload: unknown
      try {
         payload = JSON.parse(item.payload)
      }
      catch {
         continue
      }
      if (item.type !== 'event') {
         consumePerformance(app, item.type, payload)
         continue
      }
      if (!isRecord(payload))
         continue
      const event = payload

      const values = (event.exception as { values?: Array<Record<string, unknown>> } | undefined)?.values
      const exc = values?.[0]
      const message = exc
         ? `${exc.type ?? 'Error'}: ${exc.value ?? ''}`.trim()
         : String(event.message ?? 'unknown error')

      frontendErrorsTotal.inc({ app, type: 'sentry' })
      pushFrontendLog(
         app,
         'sentry',
         JSON.stringify({
            kind: 'error',
            type: 'sentry',
            message: message.slice(0, 2000),
            level: typeof event.level === 'string' ? event.level : 'error',
            event_id: typeof event.event_id === 'string' ? event.event_id : undefined,
            environment: typeof event.environment === 'string' ? event.environment : undefined,
            release: typeof event.release === 'string' ? event.release : undefined,
            path: typeof (event.request as { url?: unknown } | undefined)?.url === 'string'
               ? (event.request as { url: string }).url.slice(0, 512)
               : undefined,
            stack: exc?.stacktrace
               ? JSON.stringify(exc.stacktrace).slice(0, 4000)
               : undefined,
            ts: new Date().toISOString(),
            user_agent: c.req.header('user-agent') ?? '',
         }),
      )
   }

   // SDK 对 2xx 一律认为成功
   return c.body(null, 204)
}

// 带与不带尾斜杠都注册（DSN 直连路径以 /envelope/ 结尾）
envelopeRoutes.post('/api/:projectId/envelope', handleEnvelope)
envelopeRoutes.post('/api/:projectId/envelope/', handleEnvelope)
