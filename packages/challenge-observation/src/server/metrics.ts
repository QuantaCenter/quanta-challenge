import client from 'prom-client'

export const sentryEnvelopeItemsTotal = new client.Counter({
   name: 'sentry_envelope_items_total',
   help: 'Sentry Envelope 处理结果（accepted/invalid/unsupported/dropped）',
   labelNames: ['app', 'type', 'outcome'] as const,
})

export const observationLogDroppedTotal = new client.Counter({
   name: 'observation_log_dropped_total',
   help: 'Loki 转发丢弃数量（queue_overflow/send_error）',
   labelNames: ['reason'] as const,
})

export const sentrySpanDurationSeconds = new client.Histogram({
   name: 'sentry_span_duration_seconds',
   help: 'Sentry Span 耗时分布（前后端，操作类型归一化）',
   labelNames: ['app', 'op'] as const,
   buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
})

export const sentryEventsTotal = new client.Counter({
   name: 'sentry_events_total',
   help: 'Sentry 错误与消息事件数量（按级别和事件分类）',
   labelNames: ['app', 'kind', 'level'] as const,
})

export const sentryClientDiscardedTotal = new client.Counter({
   name: 'sentry_client_discarded_total',
   help: 'SDK 报告的丢弃数量（原因与类别归一化）',
   labelNames: ['app', 'reason', 'category'] as const,
})

export const sentrySessionUpdatesTotal = new client.Counter({
   name: 'sentry_session_updates_total',
   help: 'Sentry 单会话状态更新次数（不是独立会话数）',
   labelNames: ['app', 'status'] as const,
})

export const sentrySessionAggregatesTotal = new client.Counter({
   name: 'sentry_session_aggregates_total',
   help: 'Sentry 批量会话聚合数量',
   labelNames: ['app', 'status'] as const,
})

export const sentryLogsTotal = new client.Counter({
   name: 'sentry_logs_total',
   help: 'Sentry 结构化日志数量',
   labelNames: ['app', 'level'] as const,
})

export const sentryMetricSamplesTotal = new client.Counter({
   name: 'sentry_metric_samples_total',
   help: 'Sentry 自定义指标样本数量（具体值与单位存于 Loki）',
   labelNames: ['app', 'type'] as const,
})

export const sentryCheckInsTotal = new client.Counter({
   name: 'sentry_check_ins_total',
   help: 'Sentry 任务状态上报次数',
   labelNames: ['app', 'status'] as const,
})

// 前端上报指标（由 Prometheus 抓取）
export const register = client.register
client.collectDefaultMetrics({ register, prefix: 'observation_' })

export const frontendErrorsTotal = new client.Counter({
   name: 'frontend_errors_total',
   help: '前端异常总数（SDK 上报，按应用与类型）',
   labelNames: ['app', 'type'] as const,
})

export const frontendApiRequestsTotal = new client.Counter({
   name: 'frontend_api_requests_total',
   help: '前端 API 请求总数（按应用与状态分类：2xx/3xx/4xx/5xx/network_error）',
   labelNames: ['app', 'status'] as const,
})

export const frontendApiDurationSeconds = new client.Histogram({
   name: 'frontend_api_duration_seconds',
   help: '前端 API 请求耗时分布（浏览器侧测量）',
   labelNames: ['app'] as const,
   buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
})

export const frontendWebVitalsSeconds = new client.Histogram({
   name: 'frontend_web_vitals_seconds',
   help: '页面性能指标分布（lcp/fcp/ttfb/inp，单位秒）',
   labelNames: ['app', 'metric'] as const,
   buckets: [0.1, 0.25, 0.5, 1, 2.5, 4, 10],
})

export const frontendClsScore = new client.Histogram({
   name: 'frontend_cls_score',
   help: '累计布局偏移 CLS 分布',
   labelNames: ['app'] as const,
   buckets: [0.05, 0.1, 0.25, 0.5, 1],
})
