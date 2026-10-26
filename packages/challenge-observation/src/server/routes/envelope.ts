import { timingSafeEqual } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { config } from '../config.ts'
import { sentryEnvelopeItemsTotal } from '../metrics.ts'
import { appFromDsn, boundedApp, maxEnvelopeBytes, parseEnvelope } from '../sentry/envelope.ts'
import { writeSentryLog } from '../sentry/logging.ts'
import { consumeEvent } from '../sentry/events.ts'
import { consumePerformance } from '../sentry/performance.ts'
import { consumeTelemetry, telemetryTypes } from '../sentry/telemetry.ts'

/** Sentry Envelope 接收端点：浏览器经 tunnel 代理、服务端按 DSN 直连；DSN 的 publicKey 即 app 标识。 */

const supportedTypes = new Set(['event', 'transaction', 'span', ...telemetryTypes])
const knownTypes = new Set([...supportedTypes, 'attachment', 'profile', 'profile_chunk', 'replay_event', 'replay_recording', 'metric'])

export const envelopeRoutes = new Hono()

async function requireReportToken(c: Context, next: Next) {
   if (config.reportToken) {
      const provided = Buffer.from(c.req.header('x-obs-token') ?? '')
      const expected = Buffer.from(config.reportToken)
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
         return c.text('unauthorized', 401)
   }
   await next()
}
const limit = bodyLimit({ maxSize: maxEnvelopeBytes, onError: c => c.text('envelope too large', 413) })
envelopeRoutes.use('/api/:projectId/envelope', requireReportToken, limit)
envelopeRoutes.use('/api/:projectId/envelope/', requireReportToken, limit)

async function handleEnvelope(c: Context) {
   let raw: Buffer
   try {
      raw = Buffer.from(await c.req.arrayBuffer())
   }
   catch (error) {
      if (error instanceof Error && error.name === 'BodyLimitError')
         return c.text('envelope too large', 413)
      throw error
   }
   if (raw.length > maxEnvelopeBytes)
      return c.text('envelope too large', 413)
   if (raw.length === 0)
      return c.text('empty envelope', 400)
   const encoding = c.req.header('content-encoding')?.toLowerCase()
   if (encoding && encoding !== 'identity' && encoding !== 'gzip')
      return c.text('unsupported content encoding', 415)
   if (encoding === 'gzip') {
      try {
         raw = gunzipSync(raw, { maxOutputLength: maxEnvelopeBytes })
      }
      catch (error) {
         return c.text('invalid or oversized gzip envelope', (error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE' ? 413 : 400)
      }
   }
   const envelope = parseEnvelope(raw)
   if (!envelope)
      return c.text('invalid envelope', 400)

   const app = boundedApp(appFromDsn(envelope.dsn) ?? c.req.query('sentry_key') ?? c.req.param('projectId'))
   const results = { accepted: 0, invalid: 0, unsupported: 0, dropped: 0 }
   for (const item of envelope.items) {
      const type = item.header.type
      const labelType = knownTypes.has(type) ? type : 'unknown'
      let outcome: keyof typeof results = 'unsupported'
      if (supportedTypes.has(type)) {
         outcome = 'invalid'
         try {
            const payload: unknown = JSON.parse(item.payload.toString('utf8'))
            const countMatches = item.header.item_count === undefined
               || (typeof payload === 'object' && payload !== null && 'items' in payload && Array.isArray(payload.items) && payload.items.length === item.header.item_count)
            if (countMatches) {
               const accepted = type === 'event' ? consumeEvent(app, payload, c.req.header('user-agent') ?? '')
                  : type === 'transaction' || type === 'span' ? consumePerformance(app, type, payload)
                     : consumeTelemetry(app, type, payload)
               if (accepted === 'dropped')
                  outcome = 'dropped'
               else if (accepted)
                  outcome = 'accepted'
            }
         }
         catch {
            outcome = 'invalid'
         }
      }
      results[outcome]++
      sentryEnvelopeItemsTotal.inc({ app, type: labelType, outcome })
      if (outcome !== 'accepted')
         writeSentryLog(app, 'sentry_ingest', { kind: 'ingest', type: labelType, outcome, bytes: item.payload.length })
   }
   for (const [outcome, count] of Object.entries(results))
      c.header(`x-observation-${outcome}`, String(count))
   // 部分成功不触发整包重发；未支持的二进制载荷只记录元数据，不伪装成已存储。
   if (!results.accepted && results.invalid)
      return c.text('invalid envelope items', 400)
   return c.body(null, 204)
}

// 带与不带尾斜杠都注册（DSN 直连路径以 /envelope/ 结尾）
envelopeRoutes.post('/api/:projectId/envelope', handleEnvelope)
envelopeRoutes.post('/api/:projectId/envelope/', handleEnvelope)
