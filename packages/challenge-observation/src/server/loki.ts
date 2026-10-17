import { config } from './config.ts'

// 前端异常转发 Loki：内存缓冲定时推送，失败静默丢弃

interface PendingStream {
   stream: Record<string, string>
   values: Array<[string, string]>
}

const queue = new Map<string, PendingStream>()

export function pushFrontendLog(app: string, type: string, line: string): void {
   const key = `${app}|${type}`
   let item = queue.get(key)
   if (!item) {
      item = { stream: { source: 'frontend', app, type }, values: [] }
      queue.set(key, item)
   }
   item.values.push([`${Date.now() * 1e6}`, line])
}

async function flush(): Promise<void> {
   if (queue.size === 0)
      return

   const streams = [...queue.values()]
   queue.clear()

   try {
      const res = await fetch(`${config.lokiUrl}/loki/api/v1/push`, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ streams }),
      })
      if (!res.ok)
         console.warn(`[loki] push failed: ${res.status}`)
   }
   catch (err) {
      console.warn(`[loki] push error: ${(err as Error).message}`)
   }
}

setInterval(() => void flush(), 2000)
