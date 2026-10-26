import { z } from 'zod'
import { writeSentryLog } from './logging.ts'
import {
   frontendApiDurationSeconds,
   frontendApiRequestsTotal,
   frontendClsScore,
   frontendWebVitalsSeconds,
   sentrySpanDurationSeconds,
} from '../metrics.ts'

const numeric = z.number().finite().nonnegative()
const spanSchema = z.object({
   start_timestamp: numeric,
   end_timestamp: numeric.optional(),
   timestamp: numeric.optional(),
   attributes: z.record(z.string(), z.unknown()).optional(),
   data: z.record(z.string(), z.unknown()).optional(),
}).passthrough().refine(span => (span.end_timestamp ?? span.timestamp ?? -1) >= span.start_timestamp)
const containerSchema = z.object({ version: z.literal(2), items: z.array(spanSchema).min(1).max(1000) })
const transactionSchema = spanSchema.and(z.object({ spans: z.array(spanSchema).max(1000).optional() }).passthrough())
const metrics = ['lcp', 'fcp', 'ttfb', 'inp', 'cls'] as const
const operations = new Set(['pageload', 'navigation', 'http.client', 'http.server', 'db', 'resource.script', 'resource.css', 'resource.img', 'ui.webvital.lcp', 'ui.webvital.cls'])

export function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function attributeValue(value: unknown): unknown {
   return isRecord(value) ? value.value : value
}

function number(value: unknown): number | undefined {
   return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function seconds(value: number, unit: unknown): number | undefined {
   switch (unit) {
      case undefined:
      case 'millisecond':
      case 'ms': return value / 1000
      case 'second':
      case 's': return value
      case 'microsecond': return value / 1e6
      case 'nanosecond': return value / 1e9
      default: return undefined
   }
}

function observeVitals(app: string, span: Record<string, unknown>): void {
   const attributes = isRecord(span.attributes) ? span.attributes : {}
   const measurements = isRecord(span.measurements) ? span.measurements : {}
   for (const metric of metrics) {
      const attribute = attributes[`browser.web_vital.${metric}.value`]
      const measurement = measurements[metric]
      const source = attribute ?? measurement
      const value = number(attributeValue(source))
      if (value === undefined)
         continue
      if (metric === 'cls') {
         if (value <= 3600)
            frontendClsScore.observe({ app }, value)
      }
      else {
         const converted = seconds(value, isRecord(source) ? source.unit : undefined)
         if (converted !== undefined && converted <= 3600)
            frontendWebVitalsSeconds.observe({ app, metric }, converted)
      }
   }
}

function observeSpan(app: string, span: z.infer<typeof spanSchema>): void {
   const attributes = span.attributes ?? span.data ?? {}
   const opValue = attributeValue(attributes['sentry.op']) ?? span.op
   const op = typeof opValue === 'string' ? opValue : 'unknown'
   const duration = (span.end_timestamp ?? span.timestamp!) - span.start_timestamp
   const operation = operations.has(op) ? op : op.startsWith('ui.interaction.') ? 'ui.interaction' : 'other'
   if (duration <= 3600)
      sentrySpanDurationSeconds.observe({ app, op: operation }, duration)
   observeVitals(app, span)

   const origin = attributeValue(attributes['sentry.origin']) ?? span.origin
   if (op === 'http.client' && typeof origin === 'string' && origin.startsWith('auto.http.browser')) {
      const code = number(attributeValue(attributes['http.response.status_code']) ?? attributeValue(attributes['http.status_code']))
      const status = code !== undefined && Number.isInteger(code) && code >= 100 && code <= 599
         ? `${Math.floor(code / 100)}xx`
         : 'network_error'
      frontendApiRequestsTotal.inc({ app, status })
      if (duration <= 3600)
         frontendApiDurationSeconds.observe({ app }, duration)
   }

   writeSentryLog(app, 'sentry_performance', {
      kind: 'span', op, duration,
      name: span.name ?? span.description ?? span.transaction,
      trace_id: span.trace_id, span_id: span.span_id, parent_span_id: span.parent_span_id,
      start_timestamp: span.start_timestamp,
      end_timestamp: span.end_timestamp ?? span.timestamp,
      status: span.status,
      attributes, measurements: span.measurements,
   })
}

export function consumePerformance(app: string, type: string, payload: unknown): boolean {
   if (type === 'transaction') {
      const parsed = transactionSchema.safeParse(payload)
      if (!parsed.success)
         return false
      const transaction = parsed.data
      const trace = isRecord(transaction.contexts) && isRecord(transaction.contexts.trace) ? transaction.contexts.trace : {}
      observeSpan(app, { ...transaction, op: transaction.op ?? trace.op, trace_id: transaction.trace_id ?? trace.trace_id })
      for (const span of transaction.spans ?? [])
         observeSpan(app, span)
      return true
   }
   if (isRecord(payload) && 'version' in payload) {
      const parsed = containerSchema.safeParse(payload)
      if (!parsed.success)
         return false
      for (const span of parsed.data.items)
         observeSpan(app, span)
      return true
   }
   const parsed = spanSchema.safeParse(payload)
   if (!parsed.success)
      return false
   observeSpan(app, parsed.data)
   return true
}
