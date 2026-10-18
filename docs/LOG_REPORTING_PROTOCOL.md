# LOG_REPORTING_PROTOCOL

> 生产环境结构化日志上报协议。目标：统一各服务（web-app / cloud-function / judge / CLI 等）的日志输出格式，生产环境输出机器可读的结构化日志，取代美化输出（pretty print）。

## 1. 背景与目标

现状问题：

- 美化输出（`pino-pretty`、`[INFO]` 前缀 console、picocolors 彩色 CLI 输出）适合人眼阅读，但**不适合生产环境采集与检索**；
- 各服务日志格式不统一：web-app / cloud-function 用 pino，judge-scheduler 直接 `console.log`，CLI 自研 logger；
- 缺少统一的业务上下文字段约定。

目标：

- 生产环境输出 **JSON Lines**（一行一条 JSON，UTF-8，写 stdout/stderr）；
- 基础字段命名遵循 **OpenTelemetry Log Data Model**（OTLP JSON 编码风格），保证未来可直接对接 OTLP 采集器；
- 在此之上定义本项目通用业务字段，全仓库统一。

选用的日志库：**pino**（仓库已在用，Node 生态最成熟的结构化日志库之一，原生 JSON 输出、高性能）。开发环境继续用 `pino-pretty` 美化，生产环境关闭 transport 输出原始 JSON。

## 2. 协议总览

- 传输格式：JSON Lines（NDJSON），每行一条合法 JSON 对象；
- 输出目标：stdout（诊断性错误可 stderr），由采集器（Loki Promtail / OTel Collector / Vector 等）负责收割与转发；
- 编码：UTF-8；
- 时间：`timestamp` 使用 ISO 8601 UTC 字符串（如 `2026-10-18T08:30:00.123Z`）；
- 字段命名：
  - 顶层标准字段：遵循 OTel Log Record 字段名（snake_case）；
  - resource / attributes 内部：遵循 OTel 语义约定（点分小写，如 `service.name`、`http.request.method`）；
  - 自定义业务字段：放入 `attributes`，键名 snake_case，业务命名空间前缀 `quanta.`。

## 3. 顶层标准字段（OTel Log Record）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `timestamp` | string (ISO 8601) | 是 | 事件发生时间 |
| `observed_timestamp` | string (ISO 8601) | 否 | 采集器观测时间，由采集侧补充 |
| `severity_number` | number | 是 | OTel 级别编号，见 §5 映射表 |
| `severity_text` | string | 是 | `TRACE` / `DEBUG` / `INFO` / `WARN` / `ERROR` / `FATAL` |
| `body` | string | 是 | 日志正文（人类可读消息） |
| `trace_id` | string | 否 | W3C Trace ID（32 位 hex）。沿用现有 `x-trace-id` 头传递链路 |
| `span_id` | string | 否 | W3C Span ID（16 位 hex） |
| `trace_flags` | number | 否 | W3C Trace Flags（默认 1 = sampled） |
| `attributes` | object | 否 | 键值对，承载业务与语义字段，见 §6 |
| `resource` | object | 是 | 描述产生日志的服务实例，见 §4 |

> 注：OTLP 线上协议中 `timestamp` 为 unix 纳秒整数。本协议采用 ISO 8601 字符串以利于直接阅读与 Loki 采集；若未来直连 OTLP，采集侧负责转换。

## 4. resource 字段（服务实例维度）

| 字段 | 类型 | 说明 |
|---|---|---|
| `service.name` | string | 服务名，如 `challenge-web-app`、`challenge-cloud-function`、`challenge-judge-scheduler` |
| `service.version` | string | 构建版本（git sha 或镜像 tag） |
| `deployment.environment.name` | string | 部署环境：`development` / `staging` / `production` |
| `host.name` | string | 主机/容器名（pino 的 `hostname` 保留启用） |
| `process.pid` | number | 进程号（pino 内建 `pid`） |

## 5. 级别映射（pino ↔ OTel）

pino 的 level number 与 OTel `severity_number` 不同，需映射：

| 语义级别 | pino number | OTel severity_number | severity_text |
|---|---|---|---|
| trace | 10 | 1 | TRACE |
| debug | 20 | 5 | DEBUG |
| info | 30 | 9 | INFO |
| warn | 40 | 13 | WARN |
| error | 50 | 17 | ERROR |
| fatal | 60 | 21 | FATAL |

## 6. attributes 业务字段

### 6.1 命名规范

1. 能复用 OTel 语义约定的**必须复用**，例如：
   - HTTP：`http.request.method`、`http.response.status_code`、`url.path`、`url.full`
   - 网络/客户端：`client.address`、`network.peer.address`
   - 错误：`error.type`、`exception.message`、`exception.stacktrace`
   - 耗时：`duration`（毫秒，number）
2. 项目自定义业务字段统一前缀 `quanta.`，snake_case；
3. 值类型：标量（string / number / boolean）或一维数组，不嵌套对象；
4. 禁止在 attributes 中放超大文本（如完整请求体 > 4KB 需截断）。

### 6.2 项目通用业务字段清单

| 字段 | 类型 | 说明 | 现状出处 |
|---|---|---|---|
| `quanta.user.id` | string | 用户 ID | `judge-complete` webhook、OAuth ctx |
| `quanta.user.role` | string | 用户角色 | OAuth `role` |
| `quanta.problem.id` | string | 题目标识（`problem.pid`） | webhook 记录 |
| `quanta.judge.record_id` | string | 判题记录 ID | webhook `recordId` |
| `quanta.judge.score` | number | 总得分 | webhook `totalScore` |
| `quanta.judge.container_id` | string | 判题容器 ID | dockerode 操作 |
| `quanta.judge.network_id` | string | 判题网络 ID | docker network |
| `quanta.cloud_function.name` | string | 云函数名 | cloud-function `name` |
| `quanta.cloud_function.channel` | string | Redis 失效通知频道 | cloud-function `channel` |
| `quanta.client.id` | string | 客户端/设备标识 | OAuth `clientId`、`deviceCode` |

> 此清单为初始版本，新增业务字段时须更新本文档并保持 `quanta.` 前缀。

## 7. 与现有系统的衔接

1. **trace 链路**：现有约定是服务间通过 `x-trace-id` 请求头传递（tRPC context `ctx.traceId`、cloud-function `c.get('traceId')`），协议沿用该头，其值写入日志 `trace_id` 字段。逐步对齐为 W3C Trace Context 格式（32 位 hex）。
2. **pino 现状**：
   - `packages/challenge-cloud-function/src/utils/logger.ts` 已具备"生产 JSON / 开发 pretty + LOG_LEVEL"模式，作为协议基线实现；
   - `packages/challenge-web-app/lib/logger.ts` 生产环境也走 pino-pretty，需改造。
3. **pino 默认输出与协议的差异**：pino 默认字段为 `{ level, time, msg, pid, hostname }`，须在 logger 配置中做字段映射（`msg→body`、`time→timestamp`、`level→severity_*`、`pid/hostname→resource`）。推荐通过 pino 的 `formatters` / `mixin` 或统一的 `buildLogger()` 工厂函数实现，避免各服务重复胶水代码。
4. **改造对象**：
   - judge-scheduler：`console.log('[INFO] ...')` 全量替换为协议 logger；
   - CLI（problem-creator-cli）：终端交互输出保留美化形式；`--json` 模式对齐本协议；
   - judge-machine agents 的 `entrypoint.sh`：shell 日志保持现状，由采集器按原始文本处理（`body` 即整行文本）。

## 8. 输出示例

生产环境单行 JSON（展开展示）：

```json
{
  "timestamp": "2026-10-18T08:30:00.123Z",
  "severity_number": 9,
  "severity_text": "INFO",
  "body": "judge completed",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "attributes": {
    "duration": 3520,
    "quanta.user.id": "u_1024",
    "quanta.problem.id": "two-sum",
    "quanta.judge.record_id": "rec_88",
    "quanta.judge.score": 100
  },
  "resource": {
    "service.name": "challenge-web-app",
    "service.version": "a1b2c3d",
    "deployment.environment.name": "production",
    "host.name": "web-app-7f9c",
    "process.pid": 12
  }
}
```

错误日志示例：

```json
{
  "timestamp": "2026-10-18T08:30:05.456Z",
  "severity_number": 17,
  "severity_text": "ERROR",
  "body": "container start failed",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "attributes": {
    "error.type": "ContainerStartError",
    "exception.message": "docker daemon unreachable",
    "quanta.judge.container_id": "c9f01ab"
  },
  "resource": {
    "service.name": "challenge-judge-scheduler",
    "deployment.environment.name": "production"
  }
}
```

## 9. 上报管道

```
服务进程 (pino → JSON Lines stdout)
  → 采集器 (Promtail / OTel Collector / Vector)
  → Loki（现有日志后端，@challenge/observation 已接入）
  → Grafana 查询/告警
```

- 采集侧按 `resource.service.name` 与 `deployment.environment.name` 打 Loki label；
- `trace_id` 保留为结构化字段，供与前端监控（`@challenge/observation`）及后续 tracing 关联。

## 10. 落地步骤建议

1. 在 `@challenge/shared` 中实现统一的 `buildLogger()`（pino 工厂：字段映射 + resource 注入 + env 切换），各服务复用；
2. web-app / cloud-function 切换到统一工厂；
3. judge-scheduler 接入并替换 console 输出；
4. 采集器配置对齐 §9；
5. 文档随业务字段演进持续更新。
