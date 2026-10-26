import { z } from 'zod'
import { frontendNavigationTotal, frontendPageViewsTotal } from '../metrics.ts'
import { writeSentryLog } from './logging.ts'

const page = z.string().min(1).max(128).regex(/^(?:direct|external|unknown|other|\/(?:[\w-]+|:[\w]+)?(?:\/(?:[\w-]+|:[\w]+))*)$/)
const schema = z.object({
   version: z.literal(1),
   kind: z.enum(['entry', 'navigation']),
   from: page,
   to: page.refine(value => value !== 'direct' && value !== 'external'),
   device: z.enum(['pc', 'mobile']),
   referrer_origin: z.string().max(256).optional(),
}).refine(value => value.kind === 'entry' || !['direct', 'external'].includes(value.from))
const pages = new Map<string, Set<string>>()
const flows = new Map<string, Set<string>>()

function boundedPage(app: string, value: string): string {
   let values = pages.get(app)
   if (!values) {
      values = new Set(['direct', 'external', 'unknown', 'other'])
      pages.set(app, values)
   }
   if (!values.has(value) && values.size >= 100)
      return 'other'
   values.add(value)
   return value
}

export function consumeNavigation(app: string, payload: unknown): boolean {
   const parsed = schema.safeParse(payload)
   if (!parsed.success)
      return false
   const navigation = parsed.data
   const from = boundedPage(app, navigation.from)
   const to = boundedPage(app, navigation.to)
   frontendPageViewsTotal.inc({ app, page: to, device: navigation.device, kind: navigation.kind })
   let pairs = flows.get(app)
   if (!pairs) {
      pairs = new Set()
      flows.set(app, pairs)
   }
   const pair = `${from}|${to}`
   const overflow = !pairs.has(pair) && pairs.size >= 1000
   if (!overflow) pairs.add(pair)
   frontendNavigationTotal.inc({ app, from: overflow ? 'other' : from, to: overflow ? 'other' : to, device: navigation.device })
   let referrerOrigin: string | undefined
   if (navigation.from === 'external' && navigation.referrer_origin) {
      try {
         const url = new URL(navigation.referrer_origin)
         if (url.protocol === 'http:' || url.protocol === 'https:')
            referrerOrigin = url.origin
      }
      catch {}
   }
   writeSentryLog(app, 'sentry_navigation', {
      kind: navigation.kind,
      from, to, device: navigation.device,
      referrer_origin: referrerOrigin,
   })
   return true
}
