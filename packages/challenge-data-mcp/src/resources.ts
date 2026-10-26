export const USAGE_GUIDE = `# Quanta 查数 MCP 使用指南

## 1. 服务定位

这是一个只读 MCP。它把业务数据库安全视图、Prometheus 指标和 Loki 日志统一提供给 Agent，但不提供写库、修改 Dashboard、修改告警或执行运维动作的能力。

每次回答都应包含：

1. 查询时间范围与时区；
2. 使用的数据源和工具；
3. 核心过滤条件或查询表达式；
4. 结果是否被截断；
5. 事实、推断和不确定性的区分；
6. 工具返回的 trace_id，便于审计追踪。

## 2. 工具选择

| 需求 | 首选工具 | 何时改用其他工具 |
| --- | --- | --- |
| 平台新增、活跃、提交概览 | platform_summary | 需要按天或自定义维度时用 database_query |
| 判题结果、排队和执行耗时 | judge_statistics | 需要实时队列深度时查询 Prometheus |
| 题目成功率和参与人数 | problem_statistics | 需要自定义分组时用 database_query |
| 单用户活跃、提交、打卡 | user_activity | 需要 WebAuthn 状态时用 webauthn_status |
| WebAuthn 绑定与使用状态 | webauthn_status | 不允许查询凭据 ID、公钥或认证原始表 |
| 任意只读业务分析 | database_schema → database_query | SQL 无法由安全视图表达时应明确说明不可查询 |
| API 流量、错误率、延迟 | grafana_* Prometheus 工具 | 需要错误详情时再查 Loki |
| 容器、前端、Sentry 日志 | grafana_* Loki 工具 | 需要判断业务影响时再查数据库 |

Grafana 工具由官方 sidecar 动态注册，具体名称和参数以 tools/list 中的 grafana_* 工具 schema 为准。

## 3. 标准工作流

### 业务查数

1. 把“最近”“今天”等相对时间转换成明确的 ISO 8601 起止时间。
2. 优先调用语义工具。
3. 语义工具不能满足时，先读取 quanta://database/catalog。
4. 生成单条 SELECT/WITH SQL，只引用 agent_read.<view>，值使用 $1、$2 参数。
5. 检查返回的 rowCount、truncated 和 trace_id。
6. 回答时说明统计口径，例如“提交仅统计 type='judge'”。

### 故障排查

1. 确认服务、环境、故障起止时间。
2. Prometheus 检查吞吐、错误率、P95 和可用性。
3. Loki 使用同一时间窗口查询错误日志，并逐步收窄 container/app/type。
4. 有 trace_id 时跨日志检索；需要业务影响时调用语义数据库工具。
5. 将“监控证据”和“业务数据证据”分开陈述，禁止把时间相关性直接写成因果关系。

## 4. 限制与错误处理

- 数据库只允许单条 SELECT/WITH，最多返回 200 行。
- Grafana 日志最多返回 1000 行。
- 默认最大回看范围为 720 小时，具体由部署配置决定。
- SQL 超时默认 5 秒；超时后应缩短时间范围、减少 JOIN 或先聚合。
- 空结果可能表示真实无数据、标签不匹配、采集缺失或超出保留期，不能直接解释为 0。
- 工具报错时应向用户报告 trace_id 和失败边界，不应编造结果。

## 5. 示例提问

- “统计 2026-10-25 00:00 至 2026-10-26 00:00 UTC+8 的新增用户、活跃用户和成功提交。”
- “题目 123 最近 7 天每天的提交数和成功率，注明统计口径。”
- “用户 alice 是否绑定 WebAuthn？最近何时使用？不要返回凭据材料。”
- “过去一小时 judge-scheduler 的 5xx、P95 和错误日志是否同时升高？”
`;

export const OBSERVABILITY_GUIDE = `# Quanta 可观测性查询指南

## 数据源

### Prometheus

主要指标及标签：

| 指标 | 标签 | 含义 |
| --- | --- | --- |
| http_requests_total | service, route, method, status | 后端 HTTP 请求计数 |
| http_request_duration_seconds | service, route, method | 后端 HTTP 延迟直方图 |
| judge_queue_depth | queue, state | 判题队列 waiting/active/completed/failed/delayed/paused |
| judge_machine_available | kind | frontend/backend 判题机可用性，1 为可用 |
| judge_results_total | mode, outcome | pass/fail/error 判题结果 |
| judge_task_duration_seconds | mode, outcome | 判题任务总处理耗时 |
| judge_task_pending_seconds | mode | 判题队列等待耗时 |
| frontend_page_views_total | app, page, device, kind | 前端页面访问事件，不是独立用户 |
| frontend_errors_total | app, type | 前端异常 |
| frontend_api_requests_total | app, status | 浏览器侧 API 请求状态分类 |
| frontend_api_duration_seconds | app | 浏览器侧 API 延迟 |
| frontend_web_vitals_seconds | app, metric | LCP/FCP/TTFB/INP，单位秒 |
| frontend_cls_score | app | CLS 分布 |
| sentry_events_total | app, kind, level | Sentry 错误与消息 |
| observation_log_dropped_total | reason | Loki 转发丢弃数量 |

常用 PromQL：

\`\`\`promql
# 服务请求速率
sum(rate(http_requests_total{service="challenge-judge-scheduler"}[5m]))

# 5xx 比例
sum(rate(http_requests_total{service="challenge-judge-scheduler",status=~"5.."}[5m]))
/
clamp_min(sum(rate(http_requests_total{service="challenge-judge-scheduler"}[5m])), 0.001)

# API P95
histogram_quantile(
  0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket{service="challenge-judge-scheduler"}[5m]))
)

# 等待中的判题任务
sum(judge_queue_depth{state="waiting"})

# 判题任务 P95
histogram_quantile(
  0.95,
  sum by (le, mode) (rate(judge_task_duration_seconds_bucket[10m]))
)
\`\`\`

Counter 必须使用 rate/increase；Histogram 分位数必须查询 _bucket 并保留 le 标签。低流量场景应同时给出绝对数量，避免比例失真。

### Loki

Docker 日志标签：

- source="docker"
- container="<Docker 容器名>"
- instance="<容器网络 IP>"

前端/Sentry 日志标签：

- source="frontend"
- app="<应用名>"
- type="<事件类型，如 sentry、sentry_navigation>"

常用 LogQL：

\`\`\`logql
# 调度器错误日志
{source="docker",container=~".*judge-scheduler.*"} |~ "(?i)error|exception|failed"

# 指定 trace_id
{source=~"docker|frontend"} |= "trace-id-value"

# 前端 Sentry 错误
{source="frontend",type="sentry"} | json | kind="error"

# 五分钟错误日志速率
sum(count_over_time({source="docker"} |~ "(?i)error|exception" [5m])) by (container)
\`\`\`

先使用标签选择器缩小流，再使用 |= 或 |~ 过滤正文。不要无标签扫描全部日志。日志可能包含重复重试，应区分“日志条数”和“独立事件数”。

## 排障顺序

1. 使用 up 或目标业务指标确认采集是否正常。
2. 检查请求量，判断错误率变化是否由流量变化导致。
3. 检查 5xx 与 P95，并与部署/告警时间对齐。
4. 用完全相同的时间窗口查询 Loki。
5. 通过 trace_id、route、container、app 关联证据。
6. 最后查询数据库业务影响，例如失败提交数；数据库数据通常比实时指标更滞后。

## 保留期与解释

- Prometheus 默认保留 15 天或 5GB，以先达到者为准。
- Loki 默认保留 14 天。
- 超出保留期的空结果不能解释为零。
- backend 判题机为懒加载；从未执行后端题时 judge_machine_available{kind="backend"}=0 可以是正常状态。
`;
