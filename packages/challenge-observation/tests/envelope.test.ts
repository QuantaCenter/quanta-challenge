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

test('ordinary messages and warnings are not counted as errors', async () => {
   await report('event', { message: 'started' })
   await report('event', { logentry: { message: 'retrying', formatted: 'retry 1' }, level: 'warning' })
   await report('event', { message: 'failed', level: 'error' })
   assert.equal(await sample('frontend_errors_total', { app: 'test_app', type: 'sentry' }), 1)
   assert.equal(await sample('sentry_events_total', { app: 'test_app', kind: 'message', level: 'info' }), 1)
   assert.equal(await sample('sentry_events_total', { app: 'test_app', kind: 'message', level: 'warning' }), 1)
})

test('errors preserve exception chain and tracing context, but redact sensitive fields', async () => {
   await report('event', {
      exception: { values: [{ type: 'Outer', value: 'failure', stacktrace: { frames: [{ filename: 'app.js', lineno: 2 }] } }, { type: 'Inner', value: 'cause' }] },
      breadcrumbs: [{ category: 'http', data: { status: 200, token: 'breadcrumb-secret' } }],
      contexts: { trace: { trace_id: 'trace', span_id: 'span' } },
      extra: { password: 'password-secret', nested: { access_token: 'nested-secret', safe: 'keep' } },
      request: { url: 'https://user:pass@example.test/page?token=url-secret#hash', headers: { Authorization: 'header-secret' }, data: 'body-secret' },
      user: { id: 'opaque-id', email: 'person@example.test', ip_address: '127.0.0.1' },
   })
   mock.timers.tick(2000)
   assert.equal(logs.length, 1)
   const log = logs[0] as any
   assert.equal(log.kind, 'error')
   assert.equal(log.exception.values.length, 2)
   assert.equal(log.contexts.trace.trace_id, 'trace')
   assert.equal(log.breadcrumbs[0].data.status, 200)
   assert.equal(log.extra.nested.safe, 'keep')
   assert.equal(log.path, 'https://example.test/page')
   assert.deepEqual(log.user, { id: 'opaque-id' })
   const serialized = JSON.stringify(log)
   for (const secret of ['breadcrumb-secret', 'password-secret', 'nested-secret', 'url-secret', 'header-secret', 'body-secret', 'person@example.test'])
      assert.ok(!serialized.includes(secret))
})

test('malformed events are ignored without crashing or adding error counts', async () => {
   for (const value of [null, [], {}, { exception: { values: 'wrong' } }, { level: 'custom', message: 'invalid' }])
      assert.equal((await report('event', value)).status, 204)
   assert.equal(await sample('frontend_errors_total', { app: 'test_app', type: 'sentry' }), 0)
})

test('large contexts are bounded without invalid JSON', async () => {
   await report('event', { message: 'large', extra: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`key${i}`, 'x'.repeat(5000)])) })
   mock.timers.tick(2000)
   assert.equal(logs.length, 1)
   assert.ok(JSON.stringify(logs[0]).length < 20000)
})

test('client reports aggregate quantities and normalize arbitrary reasons/categories', async () => {
   await report('client_report', { timestamp: 100, discarded_events: [
      { reason: 'sample_rate', category: 'span', quantity: 7 },
      { reason: 'custom-reason', category: 'custom-category', quantity: 2 },
   ] })
   assert.equal(await sample('sentry_client_discarded_total', { app: 'test_app', reason: 'sample_rate', category: 'span' }), 7)
   assert.equal(await sample('sentry_client_discarded_total', { app: 'test_app', reason: 'other', category: 'unknown' }), 2)
   await report('client_report', { timestamp: 100, discarded_events: [{ reason: 'sample_rate', category: 'span', quantity: -1 }] })
   assert.equal(await sample('sentry_client_discarded_total', { app: 'test_app', reason: 'sample_rate', category: 'span' }), 7)
})

test('single session updates and batch session counts remain separate', async () => {
   const session = { sid: 'session1', init: true, timestamp: '2026-01-01', started: '2026-01-01', status: 'ok', errors: 0 }
   await report('session', session)
   await report('session', { ...session, init: false, status: 'crashed', errors: 1 })
   await report('sessions', { aggregates: [{ started: '2026-01-01', exited: 5, errored: 2, crashed: 1 }] })
   assert.equal(await sample('sentry_session_updates_total', { app: 'test_app', status: 'ok' }), 1)
   assert.equal(await sample('sentry_session_updates_total', { app: 'test_app', status: 'crashed' }), 1)
   assert.equal(await sample('sentry_session_aggregates_total', { app: 'test_app', status: 'exited' }), 5)
   assert.equal(await sample('sentry_session_aggregates_total', { app: 'test_app', status: 'errored' }), 2)
})

test('log and trace_metric v2 containers preserve values, units, and trace linkage', async () => {
   await report('log', { version: 2, items: [
      { timestamp: 100, level: 'warn', body: 'retry', trace_id: 'trace1', attributes: { password: attr('sensitive') } },
      { timestamp: 101, level: 'error', body: 'failed' },
   ] })
   await report('trace_metric', { version: 2, items: [
      { timestamp: 100, type: 'gauge', name: 'temperature', value: -5, unit: 'celsius', trace_id: 'trace1' },
      { timestamp: 101, type: 'distribution', name: 'latency', value: 123, unit: 'millisecond' },
   ] })
   assert.equal(await sample('sentry_logs_total', { app: 'test_app', level: 'warn' }), 1)
   assert.equal(await sample('sentry_metric_samples_total', { app: 'test_app', type: 'gauge' }), 1)
   assert.equal(await sample('frontend_errors_total', { app: 'test_app', type: 'sentry' }), 0)
   mock.timers.tick(2000)
   assert.ok(logs.some(log => log.name === 'temperature' && log.value === -5 && log.unit === 'celsius' && log.trace_id === 'trace1'))
   assert.ok(!JSON.stringify(logs).includes('sensitive'))
})

test('invalid container member rejects the whole item before any side effects', async () => {
   await report('log', { version: 2, items: [{ timestamp: 100, level: 'info', body: 'valid' }, { timestamp: 100, level: 'wrong', body: 'invalid' }] })
   assert.equal(await sample('sentry_logs_total', { app: 'test_app', level: 'info' }), 0)
})

test('feedback, check-ins, and CSP reports are recorded without contact details', async () => {
   await report('feedback', { event_id: 'feedback1', contexts: { feedback: { message: 'button broken', associated_event_id: 'error1', contact_email: 'secret@example.test', name: 'Private Name' } } })
   await report('user_report', { event_id: 'error1', comments: 'legacy feedback', email: 'secret@example.test', name: 'Private Name' })
   await report('check_in', { check_in_id: 'check1', monitor_slug: 'cleanup', status: 'error', duration: 1.5 })
   await report('raw_security', { 'csp-report': { 'document-uri': 'https://example.test/page?token=secret', 'violated-directive': 'script-src' } })
   assert.equal(await sample('sentry_check_ins_total', { app: 'test_app', status: 'error' }), 1)
   mock.timers.tick(2000)
   assert.ok(logs.some(log => log.kind === 'feedback' && log.associated_event_id === 'error1'))
   assert.ok(logs.some(log => log.kind === 'raw_security'))
   assert.ok(!JSON.stringify(logs).includes('secret'))
   assert.ok(!JSON.stringify(logs).includes('Private Name'))
})
