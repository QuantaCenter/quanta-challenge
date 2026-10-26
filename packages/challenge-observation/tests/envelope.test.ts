import assert from 'node:assert/strict'
import { after, beforeEach, mock, test } from 'node:test'

mock.timers.enable({ apis: ['setInterval'] })
const logs: Array<Record<string, unknown>> = []
mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
   const body = JSON.parse(String(init?.body))
   for (const stream of body.streams)
      for (const [, line] of stream.values)
         logs.push(JSON.parse(line))
   return new Response(null, { status: 204 })
})
const { envelopeRoutes } = await import('../src/server/routes/envelope.ts')
const { register } = await import('../src/server/metrics.ts')
const { config } = await import('../src/server/config.ts')
config.reportToken = 'test-token'
after(() => mock.restoreAll())
after(() => mock.timers.reset())
beforeEach(() => {
   register.resetMetrics()
   mock.timers.tick(2000)
   logs.length = 0
})

async function report(type: string, payload: unknown) {
   const body = [JSON.stringify({ dsn: 'http://test_app@localhost/1' }), JSON.stringify({ type }), JSON.stringify(payload)].join('\n')
   return envelopeRoutes.request('/api/1/envelope/', { method: 'POST', headers: { 'x-obs-token': 'test-token' }, body })
}

async function sample(name: string, labels: Record<string, string>) {
   const metric = register.getSingleMetric(name) ?? register.getSingleMetric(name.replace(/_(count|sum)$/, ''))
   assert.ok(metric)
   const data = await metric.get()
   return data.values.find(v => ('metricName' in v ? v.metricName : data.name) === name && Object.entries(labels).every(([key, value]) => v.labels[key] === value))?.value ?? 0
}

const attr = (value: string | number) => ({ type: typeof value === 'string' ? 'string' : Number.isInteger(value) ? 'integer' : 'double', value })
const span = (attributes: Record<string, unknown> = {}) => ({
   name: 'page', trace_id: '0123456789abcdef0123456789abcdef', span_id: '1111111111111111',
   start_timestamp: 100, end_timestamp: 100.25, attributes,
})

test('span v2 consumes all five Web Vitals with millisecond values and CLS zero', async () => {
   const attributes = Object.fromEntries(Object.entries({ lcp: 2500, fcp: 800, ttfb: 200, inp: 120, cls: 0 }).map(([key, value]) => [`browser.web_vital.${key}.value`, attr(value)]))
   assert.equal((await report('span', { version: 2, items: [span(attributes)] })).status, 204)
   for (const [metric, sum] of Object.entries({ lcp: 2.5, fcp: 0.8, ttfb: 0.2, inp: 0.12 })) {
      assert.equal(await sample('frontend_web_vitals_seconds_count', { app: 'test_app', metric }), 1)
      assert.equal(await sample('frontend_web_vitals_seconds_sum', { app: 'test_app', metric }), sum)
   }
   assert.equal(await sample('frontend_cls_score_count', { app: 'test_app' }), 1)
})

test('legacy transaction consumes measurements, nested browser HTTP spans, but not SSR requests', async () => {
   const transaction = {
      start_timestamp: 100, timestamp: 101,
      contexts: { trace: { op: 'pageload' } },
      measurements: { fcp: { value: 1, unit: 'second' }, ttfb: { value: 100000, unit: 'microsecond' } },
      spans: [
         { start_timestamp: 100, timestamp: 100.25, op: 'http.client', origin: 'auto.http.browser', data: { 'http.response.status_code': 503 } },
         { start_timestamp: 100, timestamp: 100.5, op: 'http.server' },
      ],
   }
   assert.equal((await report('transaction', transaction)).status, 204)
   assert.equal(await sample('frontend_web_vitals_seconds_sum', { app: 'test_app', metric: 'fcp' }), 1)
   assert.equal(await sample('frontend_web_vitals_seconds_sum', { app: 'test_app', metric: 'ttfb' }), 0.1)
   assert.equal(await sample('frontend_api_requests_total', { app: 'test_app', status: '5xx' }), 1)
   assert.equal(await sample('frontend_api_duration_seconds_sum', { app: 'test_app' }), 0.25)
   assert.equal(await sample('sentry_span_duration_seconds_count', { app: 'test_app', op: 'pageload' }), 1)
})

test('v2 browser HTTP spans classify status and use timestamp seconds', async () => {
   await report('span', { version: 2, items: [span({
      'sentry.op': attr('http.client'), 'sentry.origin': attr('auto.http.browser.fetch'), 'http.response.status_code': attr(200),
   }), span({ 'sentry.op': attr('http.client'), 'sentry.origin': attr('auto.http.browser.xhr') })] })
   assert.equal(await sample('frontend_api_requests_total', { app: 'test_app', status: '2xx' }), 1)
   assert.equal(await sample('frontend_api_requests_total', { app: 'test_app', status: 'network_error' }), 1)
   assert.equal(await sample('frontend_api_duration_seconds_sum', { app: 'test_app' }), 0.5)
})

test('invalid versions and reversed timestamps do not pollute metrics', async () => {
   await report('span', { version: 3, items: [span()] })
   await report('span', { version: 2, items: [{ ...span(), end_timestamp: 99 }] })
   assert.equal(await sample('sentry_span_duration_seconds_count', { app: 'test_app', op: 'other' }), 0)
   await report('span', span({ 'browser.web_vital.lcp.value': attr(-1), 'browser.web_vital.fcp.value': { value: 5, unit: 'invalid' } }))
   assert.equal(await sample('frontend_web_vitals_seconds_count', { app: 'test_app', metric: 'lcp' }), 0)
   assert.equal(await sample('frontend_web_vitals_seconds_count', { app: 'test_app', metric: 'fcp' }), 0)
})
