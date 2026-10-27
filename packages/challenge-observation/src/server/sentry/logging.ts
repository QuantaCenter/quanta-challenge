import { pushFrontendLog } from '../loki.ts'

const sensitive = /password|passwd|secret|token|authorization|cookie|api[-_.]?key|email|ip[-_.]?address|username|^headers$|^env$/i

function redactText(text: string): string {
   return text.slice(0, 2000)
      .replace(/https?:\/\/[^\s<>"']+/g, (value) => {
         try {
            const url = new URL(value)
            return `${url.protocol}//${url.host}${url.pathname}`
         }
         catch {
            return '[invalid-url]'
         }
      })
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted-email]')
      .replace(/Bearer\s+[^\s,"']+/gi, 'Bearer [redacted]')
}

export function sanitizeLog(value: unknown): unknown {
   let remaining = 16000
   function visit(input: unknown, depth: number): unknown {
      if (remaining <= 0 || depth > 10)
         return '[truncated]'
      remaining -= 8
      if (typeof input === 'string') {
         const text = redactText(input).slice(0, Math.max(0, remaining))
         remaining -= text.length
         return text
      }
      if (Array.isArray(input))
         return input.slice(0, 30).map(item => visit(item, depth + 1))
      if (typeof input === 'object' && input !== null) {
         const result: Record<string, unknown> = Object.create(null)
         for (const [key, child] of Object.entries(input).slice(0, 50)) {
            if (remaining <= 0)
               break
            const name = key.slice(0, 128)
            remaining -= name.length
            result[name] = sensitive.test(name) ? '[redacted]' : visit(child, depth + 1)
         }
         return result
      }
      return input
   }
   return visit(value, 0)
}

export function writeSentryLog(app: string, type: string, event: Record<string, unknown>): boolean {
   return pushFrontendLog(app, type, JSON.stringify(sanitizeLog({ ...event, ts: new Date().toISOString() })))
}
