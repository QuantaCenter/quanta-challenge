import { z } from 'zod'
import {
   sentryCheckInsTotal,
   sentryClientDiscardedTotal,
   sentryLogsTotal,
   sentryMetricSamplesTotal,
   sentrySessionAggregatesTotal,
   sentrySessionUpdatesTotal,
} from '../metrics.ts'
import { writeSentryLog } from './logging.ts'

const time = z.number().finite().nonnegative()
const count = z.number().int().nonnegative().max(1e9)
const attributes = z.record(z.string(), z.unknown()).optional()
const clientReportSchema = z.object({
   timestamp: time,
   discarded_events: z.array(z.object({ reason: z.string().min(1).max(128), category: z.string().min(1).max(64), quantity: count })).max(1000),
})
const sessionSchema = z.object({
   sid: z.string().min(1).max(128), init: z.boolean(),
   timestamp: z.string(), started: z.string(),
   status: z.enum(['ok', 'exited', 'crashed', 'abnormal', 'unhandled']), errors: count,
   duration: time.optional(),
}).passthrough()
const sessionsSchema = z.object({
   aggregates: z.array(z.object({ started: z.string(), exited: count.optional(), errored: count.optional(), crashed: count.optional() })).min(1).max(1000),
}).passthrough()
const logSchema = z.object({
   timestamp: time, level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']), body: z.string(),
   trace_id: z.string().optional(), severity_number: z.number().optional(), attributes,
})
const metricSchema = z.object({
   timestamp: time, name: z.string().min(1).max(256),
   type: z.enum(['counter', 'gauge', 'distribution']), value: z.number().finite(),
   unit: z.string().max(64).optional(), trace_id: z.string().optional(), span_id: z.string().optional(), attributes,
})
const logContainer = z.object({ version: z.literal(2), items: z.array(logSchema).min(1).max(1000) })
const metricContainer = z.object({ version: z.literal(2), items: z.array(metricSchema).min(1).max(1000) })
const checkInSchema = z.object({
   check_in_id: z.string().min(1).max(128), monitor_slug: z.string().min(1).max(256),
   status: z.enum(['in_progress', 'ok', 'error']), duration: time.optional(),
}).passthrough()
const feedbackSchema = z.object({
   event_id: z.string().optional(),
   contexts: z.object({ feedback: z.object({
      message: z.string().min(1), associated_event_id: z.string().optional(),
      url: z.string().optional(), source: z.string().optional(),
   }) }),
})
const userReportSchema = z.object({ event_id: z.string().min(1), comments: z.string().min(1) })
const securitySchema = z.object({ 'csp-report': z.record(z.string(), z.unknown()) })
const reasons = new Set(['before_send', 'callback_error', 'event_processor', 'network_error', 'queue_overflow', 'ratelimit_backoff', 'sample_rate', 'send_error', 'internal_sdk_error', 'buffer_overflow', 'ignored', 'invalid', 'no_parent_span'])
const categories = new Set(['default', 'error', 'transaction', 'replay', 'security', 'attachment', 'session', 'internal', 'profile', 'monitor', 'feedback', 'span', 'log_item', 'log_byte', 'metric', 'unknown'])

export const telemetryTypes = new Set(['client_report', 'session', 'sessions', 'log', 'trace_metric', 'feedback', 'user_report', 'check_in', 'raw_security'])

export function consumeTelemetry(app: string, type: string, payload: unknown): boolean {
   switch (type) {
      case 'client_report': {
         const parsed = clientReportSchema.safeParse(payload)
         if (!parsed.success)
            return false
         for (const event of parsed.data.discarded_events) {
            sentryClientDiscardedTotal.inc({
               app, reason: reasons.has(event.reason) ? event.reason : 'other',
               category: categories.has(event.category) ? event.category : 'unknown',
            }, event.quantity)
         }
         writeSentryLog(app, 'sentry_client_report', { kind: type, ...parsed.data })
         return true
      }
      case 'session': {
         const parsed = sessionSchema.safeParse(payload)
         if (!parsed.success)
            return false
         sentrySessionUpdatesTotal.inc({ app, status: parsed.data.status })
         const { did: _did, ...session } = parsed.data
         writeSentryLog(app, 'sentry_session', { kind: type, ...session })
         return true
      }
      case 'sessions': {
         const parsed = sessionsSchema.safeParse(payload)
         if (!parsed.success)
            return false
         for (const aggregate of parsed.data.aggregates)
            for (const status of ['exited', 'errored', 'crashed'] as const)
               if (aggregate[status] !== undefined)
                  sentrySessionAggregatesTotal.inc({ app, status }, aggregate[status])
         writeSentryLog(app, 'sentry_session', { kind: type, ...parsed.data })
         return true
      }
      case 'log': {
         const parsed = logContainer.safeParse(payload)
         if (!parsed.success)
            return false
         for (const log of parsed.data.items) {
            sentryLogsTotal.inc({ app, level: log.level })
            writeSentryLog(app, 'sentry_log', { kind: type, ...log })
         }
         return true
      }
      case 'trace_metric': {
         const parsed = metricContainer.safeParse(payload)
         if (!parsed.success)
            return false
         for (const metric of parsed.data.items) {
            sentryMetricSamplesTotal.inc({ app, type: metric.type })
            writeSentryLog(app, 'sentry_metric', { kind: type, ...metric })
         }
         return true
      }
      case 'check_in': {
         const parsed = checkInSchema.safeParse(payload)
         if (!parsed.success)
            return false
         sentryCheckInsTotal.inc({ app, status: parsed.data.status })
         writeSentryLog(app, 'sentry_check_in', { kind: type, ...parsed.data })
         return true
      }
      case 'feedback': {
         const parsed = feedbackSchema.safeParse(payload)
         if (!parsed.success)
            return false
         writeSentryLog(app, 'sentry_feedback', { kind: type, event_id: parsed.data.event_id, ...parsed.data.contexts.feedback })
         return true
      }
      case 'user_report': {
         const parsed = userReportSchema.safeParse(payload)
         if (!parsed.success)
            return false
         writeSentryLog(app, 'sentry_feedback', { kind: type, ...parsed.data })
         return true
      }
      case 'raw_security': {
         const parsed = securitySchema.safeParse(payload)
         if (!parsed.success)
            return false
         writeSentryLog(app, 'sentry_security', { kind: type, ...parsed.data })
         return true
      }
      default: return false
   }
}
