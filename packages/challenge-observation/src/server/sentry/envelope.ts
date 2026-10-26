import { z } from 'zod'

export const maxEnvelopeBytes = 1024 * 1024
const envelopeHeader = z.object({ dsn: z.string().max(2048).optional() })
const itemHeader = z.object({
   type: z.string().min(1).max(64),
   length: z.number().int().nonnegative().max(maxEnvelopeBytes).optional(),
   item_count: z.number().int().nonnegative().max(1000).optional(),
   content_type: z.string().max(256).optional(),
}).passthrough()
export interface EnvelopeItem {
   header: z.infer<typeof itemHeader>
   payload: Buffer
}

function readLine(buf: Buffer, offset: number) {
   if (offset >= buf.length)
      return undefined
   const newline = buf.indexOf(0x0a, offset)
   const end = newline === -1 ? buf.length : newline
   return { line: buf.subarray(offset, end).toString('utf8').replace(/\r$/, ''), end, next: end + (newline === -1 ? 0 : 1) }
}

export function parseEnvelope(buf: Buffer): { dsn?: string; items: EnvelopeItem[] } | undefined {
   if (buf.length > maxEnvelopeBytes)
      return undefined
   try {
      const first = readLine(buf, 0)
      if (!first)
         return undefined
      const parsedHeader = envelopeHeader.parse(JSON.parse(first.line))
      const items: EnvelopeItem[] = []
      let offset = first.next
      while (offset < buf.length) {
         const line = readLine(buf, offset)
         if (!line || !line.line)
            return undefined
         const header = itemHeader.parse(JSON.parse(line.line))
         offset = line.next
         let payload: Buffer
         if (header.length !== undefined) {
            if (offset + header.length > buf.length)
               return undefined
            payload = buf.subarray(offset, offset + header.length)
            offset += header.length
            if (offset < buf.length) {
               if (buf[offset] !== 0x0a)
                  return undefined
               offset++
            }
         }
         else {
            const payloadLine = readLine(buf, offset)
            if (!payloadLine)
               return undefined
            payload = buf.subarray(offset, payloadLine.end)
            offset = payloadLine.next
         }
         items.push({ header, payload })
         if (items.length > 100)
            return undefined
      }
      return items.length ? { ...parsedHeader, items } : undefined
   }
   catch {
      return undefined
   }
}

const applications = new Set<string>()
export function boundedApp(value: string | undefined): string {
   if (!value || !/^[\w.-]{1,64}$/.test(value))
      return 'unknown'
   if (!applications.has(value) && applications.size >= 100)
      return 'other'
   applications.add(value)
   return value
}

export function appFromDsn(dsn: string | undefined): string | undefined {
   if (!dsn)
      return undefined
   try {
      return new URL(dsn).username || undefined
   }
   catch {
      return undefined
   }
}
