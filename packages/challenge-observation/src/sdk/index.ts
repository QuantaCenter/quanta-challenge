import { collectPerformance } from './performance.ts'
import type { Reporter } from './reporter.ts'
import { createReporter } from './reporter.ts'
import type { ObservationOptions } from './types.ts'

export type { ObservationOptions, ObsEvent } from './types.ts'

declare global {
   interface XMLHttpRequest {
      __obsMeta?: { method: string, url: string }
   }
}

// 前端监控 SDK：JS 异常 / Web Vitals / API 请求异常 用法：initObservation({ endpoint: 'https://obs.example.com/api/v1/report', app: 'xxx' }) 或 <script src="observation-sdk.iife.js"> 后调用 ObservationSDK.initObservation(...)

function matches(patterns: Array<string | RegExp>, value: string): boolean {
   return patterns.some(p =>
      typeof p === 'string' ? value.includes(p) : p.test(value),
   )
}

function installErrorHandlers(reporter: Reporter, options: ObservationOptions): void {
   const ignore = options.ignoreErrors ?? []
   const path = () => (typeof location !== 'undefined' ? location.pathname : undefined)

   window.addEventListener('error', (event) => {
      // 资源加载失败
      const target = event.target as (HTMLElement & { src?: string, href?: string }) | null
      if (target && (target.src || target.href)) {
         reporter.send({
            kind: 'error',
            type: 'resource',
            message: `resource failed: ${target.src ?? target.href}`,
            source: target.src ?? target.href,
            path: path(),
         })
         return
      }

      const message = event.message ?? 'unknown error'
      if (matches(ignore, message))
         return
      reporter.send({
         kind: 'error',
         type: 'js',
         message: message.slice(0, 2000),
         stack: event.error?.stack?.slice(0, 4000),
         source: event.filename,
         lineno: event.lineno,
         colno: event.colno,
         path: path(),
      })
   }, true)

   window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason
      const message = reason instanceof Error
         ? reason.message
         : typeof reason === 'string' ? reason : JSON.stringify(reason)?.slice(0, 500) ?? 'unknown rejection'
      if (matches(ignore, message))
         return
      reporter.send({
         kind: 'error',
         type: 'promise',
         message: message.slice(0, 2000),
         stack: reason instanceof Error ? reason.stack?.slice(0, 4000) : undefined,
         path: path(),
      })
   })
}

function installApiTracking(reporter: Reporter, options: ObservationOptions): void {
   const track = options.trackApi
   const endpoint = options.endpoint

   function shouldTrack(url: string): boolean {
      if (url === endpoint)
         return false
      if (track)
         return matches(track, url)
      // 默认只追踪同源请求
      try {
         return new URL(url, location.href).origin === location.origin
      }
      catch {
         return false
      }
   }

   const origFetch = window.fetch
   window.fetch = async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === 'string'
         ? input
         : input instanceof URL ? input.href : input.url
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
      const start = performance.now()
      try {
         const res = await origFetch.call(this === undefined ? window : this, input as RequestInfo, init)
         if (shouldTrack(url)) {
            reporter.send({
               kind: 'api',
               method,
               url: url.slice(0, 512),
               status: res.status,
               duration: performance.now() - start,
               ok: res.ok,
            })
         }
         return res
      }
      catch (err) {
         if (shouldTrack(url)) {
            reporter.send({
               kind: 'api',
               method,
               url: url.slice(0, 512),
               duration: performance.now() - start,
               ok: false,
            })
         }
         throw err
      }
   } as typeof window.fetch

   // XHR（axios 等库底层使用）
   const origOpen = XMLHttpRequest.prototype.open
   const origSend = XMLHttpRequest.prototype.send
   XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: Parameters<typeof origOpen>) {
      const [method, url] = args
      this.__obsMeta = { method: String(method).toUpperCase(), url: String(url) }
      return origOpen.apply(this, args)
   } as unknown as typeof XMLHttpRequest.prototype.open
   XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: Parameters<typeof origSend>) {
      const meta = this.__obsMeta
      if (meta && shouldTrack(meta.url)) {
         const start = performance.now()
         this.addEventListener('loadend', () => {
            const status = this.status
            reporter.send({
               kind: 'api',
               method: meta.method,
               url: meta.url.slice(0, 512),
               status: status || undefined,
               duration: performance.now() - start,
               ok: status >= 200 && status < 400,
            })
         })
      }
      return origSend.apply(this, args)
   }
}

export function initObservation(options: ObservationOptions): { flush: () => void } {
   if (typeof window === 'undefined')
      return { flush: () => {} }

   const reporter = createReporter(options)
   installErrorHandlers(reporter, options)
   installApiTracking(reporter, options)
   collectPerformance(metrics => reporter.send({ kind: 'perf', path: location.pathname, metrics }))

   if (options.debug)
      console.info('[observation] initialized:', options.app)
   return { flush: () => reporter.flush(true) }
}
