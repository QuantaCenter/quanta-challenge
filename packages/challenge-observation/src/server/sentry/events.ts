import { z } from 'zod'
import { frontendErrorsTotal, sentryEventsTotal } from '../metrics.ts'
import { isRecord } from './performance.ts'
import { writeSentryLog } from './logging.ts'

export const levelSchema = z.enum(['debug', 'info', 'log', 'warning', 'error', 'fatal'])
const eventSchema = z.object({
   message: z.string().optional(),
   logentry: z.object({ message: z.string().optional(), formatted: z.string().optional() }).passthrough().optional(),
   level: levelSchema.optional(),
   exception: z.object({ values: z.array(z.record(z.string(), z.unknown())).min(1).max(30) }).optional(),
}).passthrough().refine(event => Boolean(event.exception || event.message || event.logentry?.message || event.logentry?.formatted))

export function consumeEvent(app: string, payload: unknown, userAgent: string): boolean {
   const parsed = eventSchema.safeParse(payload)
   if (!parsed.success)
      return false
   const event = parsed.data
   const exceptions = event.exception?.values ?? []
   const first = exceptions[0]
   const level = event.level ?? (first ? 'error' : 'info')
   const kind = first || level === 'error' || level === 'fatal' ? 'error' : 'message'
   const message = first ? `${first.type ?? 'Error'}: ${first.value ?? ''}` : event.logentry?.formatted ?? event.message ?? event.logentry?.message
   if (kind === 'error')
      frontendErrorsTotal.inc({ app, type: 'sentry' })
   sentryEventsTotal.inc({ app, kind, level })
   const request = isRecord(event.request) ? event.request : {}
   writeSentryLog(app, 'sentry', {
      kind, type: 'sentry', message, level,
      event_id: event.event_id,
      environment: event.environment, release: event.release,
      sentry_timestamp: event.timestamp,
      path: request.url,
      request: { url: request.url, method: request.method },
      exception: event.exception,
      stack: first?.stacktrace,
      stacktrace: event.stacktrace,
      breadcrumbs: event.breadcrumbs,
      contexts: event.contexts,
      tags: event.tags,
      extra: event.extra,
      fingerprint: event.fingerprint,
      user: isRecord(event.user) ? { id: event.user.id } : undefined,
      user_agent: userAgent,
   })
   return true
}
