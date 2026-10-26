import { config } from './config.ts'
import { logger } from './logger.ts'
import { observationLogDroppedTotal } from './metrics.ts'

// 前端日志转发 Loki：有界内存缓冲定时推送，丢弃原因计入指标。

interface PendingStream {
   stream: Record<string, string>
   values: Array<[string, string]>
}

const queue = new Map<string, PendingStream>()
let queuedBytes = 0
let queuedCount = 0
let flushing = false

export function pushFrontendLog(app: string, type: string, line: string): boolean {
   const bytes = Buffer.byteLength(line)
   if (queuedCount >= 5000 || queuedBytes + bytes > 8 * 1024 * 1024) {
      observationLogDroppedTotal.inc({ reason: 'queue_overflow' })
      return false
   }
   queuedBytes += bytes
   queuedCount++
   const key = `${app}|${type}`
   let item = queue.get(key)
   if (!item) {
      item = { stream: { source: 'frontend', app, type }, values: [] }
      queue.set(key, item)
   }
   item.values.push([`${Date.now() * 1e6}`, line])
   return true
}

async function flush(): Promise<void> {
   if (queue.size === 0 || flushing)
      return

   flushing = true
   const streams = [...queue.values()]
   const count = queuedCount
   queue.clear()
   queuedCount = 0
   queuedBytes = 0

   try {
      const res = await fetch(`${config.lokiUrl}/loki/api/v1/push`, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ streams }),
         signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) {
         observationLogDroppedTotal.inc({ reason: 'send_error' }, count)
         logger.warn(`loki push failed: ${res.status}`)
      }
   }
   catch (err) {
      observationLogDroppedTotal.inc({ reason: 'send_error' }, count)
      logger.warn(`loki push error: ${(err as Error).message}`)
   }
   finally {
      flushing = false
   }
}

setInterval(() => void flush(), 2000)
