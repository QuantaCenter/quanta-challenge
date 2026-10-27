import type { ObsPerfMetrics } from './types.ts'

// 性能采集：TTFB/FCP load 时上报，LCP/CLS/INP 页面隐藏时上报终值
export function collectPerformance(onFinal: (metrics: ObsPerfMetrics) => void): void {
   if (typeof window === 'undefined' || !('PerformanceObserver' in window))
      return

   const metrics: ObsPerfMetrics = {}
   let initialSent = false
   let finalSent = false

   function sendInitial(): void {
      if (initialSent)
         return
      initialSent = true
      const initial: ObsPerfMetrics = {}
      if (metrics.ttfb !== undefined)
         initial.ttfb = metrics.ttfb
      if (metrics.fcp !== undefined)
         initial.fcp = metrics.fcp
      if (Object.keys(initial).length > 0)
         onFinal(initial)
   }

   // TTFB
   const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
   if (nav && nav.responseStart > 0)
      metrics.ttfb = nav.responseStart / 1000

   // FCP
   try {
      new PerformanceObserver((list) => {
         const entries = list.getEntries()
         if (entries.length > 0) {
            metrics.fcp = (entries[entries.length - 1] as PerformanceEntry).startTime / 1000
            sendInitial()
         }
      }).observe({ type: 'paint', buffered: true })
   }
   catch {}

   // LCP（持续更新，取最大绘制）
   try {
      new PerformanceObserver((list) => {
         const entries = list.getEntries()
         if (entries.length > 0)
            metrics.lcp = (entries[entries.length - 1] as PerformanceEntry).startTime / 1000
      }).observe({ type: 'largest-contentful-paint', buffered: true })
   }
   catch {}

   // CLS（简化版会话窗口：5s 窗口 / 1s 间隔）
   let cls = 0
   let sessionValue = 0
   let sessionStart = 0
   let lastShiftTime = 0
   try {
      new PerformanceObserver((list) => {
         for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { hadRecentInput?: boolean, value: number, startTime: number }
            if (shift.hadRecentInput)
               continue
            if (sessionStart > 0 && (shift.startTime - lastShiftTime > 1000 || shift.startTime - sessionStart > 5000))
               sessionValue = 0
            if (sessionStart === 0)
               sessionStart = shift.startTime
            lastShiftTime = shift.startTime
            sessionValue += shift.value
            cls = Math.max(cls, sessionValue)
         }
         metrics.cls = cls
      }).observe({ type: 'layout-shift', buffered: true })
   }
   catch {}

   // INP（近似：取最长交互时延）
   try {
      new PerformanceObserver((list) => {
         for (const entry of list.getEntries()) {
            const timing = entry as PerformanceEntry & { duration: number }
            if (metrics.inp === undefined || timing.duration / 1000 > metrics.inp)
               metrics.inp = timing.duration / 1000
         }
      }).observe({ type: 'event', durationThreshold: 40, buffered: true } as PerformanceObserverInit)
   }
   catch {}

   window.addEventListener('load', sendInitial, { once: true })

   // 页面隐藏时上报终值
   document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && !finalSent) {
         finalSent = true
         const final: ObsPerfMetrics = {}
         if (metrics.lcp !== undefined)
            final.lcp = metrics.lcp
         if (metrics.cls !== undefined)
            final.cls = metrics.cls
         if (metrics.inp !== undefined)
            final.inp = metrics.inp
         if (Object.keys(final).length > 0)
            onFinal(final)
      }
   })
}
