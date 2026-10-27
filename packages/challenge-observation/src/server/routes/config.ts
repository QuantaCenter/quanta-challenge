import { Hono } from 'hono'
import { getAllConfig, getConfigValue, setConfigValue } from '../db.ts'

// 业务配置 KV（SQLite）
export const configRoutes = new Hono()

configRoutes.get('/', (c) => {
   return c.json({ config: getAllConfig() })
})

configRoutes.get('/:key', (c) => {
   const key = c.req.param('key')
   const value = getConfigValue(key)
   if (value === undefined)
      return c.text('not found', 404)
   return c.json({ key, value })
})

configRoutes.put('/:key', async (c) => {
   let body: unknown
   try {
      body = await c.req.json()
   }
   catch {
      return c.text('invalid json, expected {"value": ...}', 400)
   }

   const value = (body as { value?: unknown })?.value
   if (value === undefined)
      return c.text('missing "value" field', 400)

   const key = c.req.param('key')
   if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(key))
      return c.text('invalid key', 400)

   setConfigValue(key, value)
   return c.json({ key, value: getConfigValue(key) })
})

configRoutes.delete('/:key', (c) => {
   const key = c.req.param('key')
   const value = getConfigValue(key)
   if (value === undefined)
      return c.text('not found', 404)
   setConfigValue(key, null)
   return c.body(null, 204)
})
