import type { ObservationOptions, ObsEvent } from './types.ts'

const SDK_VERSION = '1.0.0'

export interface Reporter {
   send: (event: ObsEvent) => void
   flush: (useBeacon?: boolean) => void
}
export function createReporter(options: ObservationOptions): Reporter {
   const {
      endpoint,
      app,
      release,
      token,
      sampleRate = 1,
      flushInterval = 10_000,
      maxBatch = 20,
      debug = false,
   } = options

   const queue: ObsEvent[] = []
   let sending = false

   function shouldSample(): boolean {
      return sampleRate >= 1 || Math.random() < sampleRate
   }

   function send(event: ObsEvent): void {
      // perf 低频关键，不采样
      if (event.kind !== 'perf' && !shouldSample())
         return
      queue.push(event)
      if (queue.length >= maxBatch)
         flush()
   }

   function flush(useBeacon = false): void {
      if (queue.length === 0 || sending)
         return
      const events = queue.splice(0, maxBatch)
      const body = JSON.stringify({
         app,
         release,
         events,
         meta: {
            sdk: `observation-sdk/${SDK_VERSION}`,
            ts: Date.now(),
            path: typeof location !== 'undefined' ? location.pathname : undefined,
         },
      })

      // 页面卸载时优先 sendBeacon
      if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
         try {
            if (navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' })))
               return
         }
         catch {}
      }

      sending = true
      fetch(endpoint, {
         method: 'POST',
         headers: {
            'content-type': 'application/json',
            ...(token ? { 'x-obs-token': token } : {}),
         },
         body,
         keepalive: true,
      })
         .then((res) => {
            if (!res.ok && debug)
               console.warn(`[observation] report failed: ${res.status}`)
         })
         .catch((err: unknown) => {
            if (debug)
               console.warn('[observation] report error:', err)
         })
         .finally(() => {
            sending = false
         })
   }

   const timer = setInterval(() => flush(), flushInterval)
   if (typeof timer === 'object' && 'unref' in timer)
      timer.unref?.()

   if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
         if (document.visibilityState === 'hidden')
            flush(true)
      })
   }

   return { send, flush }
}
