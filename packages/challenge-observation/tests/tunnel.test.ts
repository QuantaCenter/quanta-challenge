import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { gzipSync } from 'node:zlib'

interface Event {
   body: Buffer
   headers: Record<string, string>
   responseHeaders: Record<string, string>
   status?: number
}
let forwarded: { url: string; options: Record<string, any> } | undefined
let upstreamStatus = 204
Object.assign(globalThis, {
   defineEventHandler: (handler: unknown) => handler,
   useRuntimeConfig: () => ({ observation: { serverUrl: 'http://observation.test' } }),
   readRawBody: (event: Event, encoding: unknown) => {
      assert.equal(encoding, false)
      return Promise.resolve(event.body)
   },
   getRequestHeader: (event: Event, name: string) => event.headers[name],
   setResponseStatus: (event: Event, status: number) => { event.status = status },
   setResponseHeader: (event: Event, name: string, value: string) => { event.responseHeaders[name] = value },
   $fetch: { raw: async (url: string, options: Record<string, any>) => {
      forwarded = { url, options }
      return new Response(null, { status: upstreamStatus, headers: { 'x-observation-accepted': '1', 'x-observation-invalid': '0', 'x-observation-unsupported': '1', 'x-observation-dropped': '2' } })
   } },
})
const path = new URL('../../challenge-web-app/server/api/observation/sentry-tunnel.post.ts', import.meta.url).href
const { default: tunnel } = await import(path)
beforeEach(() => { forwarded = undefined; upstreamStatus = 204 })

test('tunnel forwards compressed bytes, encoding, token and ingest result headers without retries', async () => {
   const previous = process.env.OBSERVATION_REPORT_TOKEN
   process.env.OBSERVATION_REPORT_TOKEN = 'proxy-token'
   try {
      const body = gzipSync(Buffer.from('binary envelope'))
      const event: Event = { body, headers: { 'content-encoding': 'gzip', 'user-agent': 'browser' }, responseHeaders: {} }
      await tunnel(event)
      assert.equal(event.status, 204)
      assert.deepEqual(forwarded?.options.body, body)
      assert.equal(forwarded?.options.headers['content-encoding'], 'gzip')
      assert.equal(forwarded?.options.headers['x-obs-token'], 'proxy-token')
      assert.equal(forwarded?.options.retry, 0)
      assert.equal(forwarded?.options.ignoreResponseError, true)
      assert.equal(event.responseHeaders['x-observation-unsupported'], '1')
      assert.equal(event.responseHeaders['x-observation-dropped'], '2')
   }
   finally {
      if (previous === undefined) delete process.env.OBSERVATION_REPORT_TOKEN
      else process.env.OBSERVATION_REPORT_TOKEN = previous
   }
})

test('tunnel preserves upstream 400 instead of turning it into 502', async () => {
   upstreamStatus = 400
   const event: Event = { body: Buffer.from('invalid'), headers: {}, responseHeaders: {} }
   await tunnel(event)
   assert.equal(event.status, 400)
})

test('tunnel rejects oversized requests before forwarding', async () => {
   const event: Event = { body: Buffer.alloc(1024 * 1024 + 1), headers: {}, responseHeaders: {} }
   await tunnel(event)
   assert.equal(event.status, 413)
   assert.equal(forwarded, undefined)
})
