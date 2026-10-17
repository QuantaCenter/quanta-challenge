# @challenge/observation — 轻量级前后端一体化监控平台

面向**单台 VPS** 的低成本、低资源占用、易维护监控方案。全配置化部署（Docker Compose），数据全部落盘本地，预留 OpenTelemetry / Tempo 扩展能力。

## 架构

```
                    ┌────────────────────── VPS (Docker Compose) ──────────────────────┐
  浏览器            │                                                                    │
 ┌─────────┐  SDK   │  ┌──────────────┐   /metrics    ┌────────────┐                    │
 │ web-app │───────▶│  │ observation  │──────────────▶│            │                    │
 └─────────┘ report │  │ (Hono+SQLite)│               │ Prometheus │◀─── node-exporter  │
                    │  │  前端指标聚合 │               │  (15d/5GB) │◀─── cadvisor       │
 业务后端            │  │  错误→Loki    │               └─────┬──────┘◀─── observation     │
 ┌───────────────┐  │  │  配置/告警记录 │                     │                            │
 │ judge-scheduler│◀┼──┼──── /metrics │                ┌─────▼──────┐                     │
 │ cloud-function │  │  └──────▲───────┘                │   Grafana  │◀──── Loki(14d)      │
 └───────────────┘  │         │   alert webhook        │ 可视化/告警 │                     │
                    │         └────────────────────────┤            │◀──── Alloy          │
                    │   所有容器 stdout/stderr          └────────────┘                     │
                    │              Alloy ──(docker.sock)──▶ Loki                          │
                    └─────────────────────────────────────────────────────────────────────┘
```

| 组件 | 职责 | 数据保留 |
| --- | --- | --- |
| Prometheus | 主机/容器/后端 API/前端上报指标采集与存储 | 15 天或 5GB |
| Loki | 容器日志 + 前端异常日志存储 | 14 天 |
| Grafana Alloy | 采集所有 Docker 容器 stdout/stderr → Loki | - |
| node-exporter | 主机 CPU/内存/磁盘/网络指标 | - |
| cadvisor | Docker 容器资源指标 | - |
| Grafana | 统一可视化、Dashboard、日志查询、统一告警（webhook → SQLite） | Grafana 自身 SQLite |
| observation | 自研采集服务：SDK 上报聚合为 Prometheus 指标、错误转发 Loki、业务配置与告警记录（SQLite） | 随备份永久保留 |

## 目录结构

```
packages/challenge-observation/
├── Dockerfile                     # observation 服务镜像（自包含单文件产物）
├── package.json
├── scripts/
│   ├── build.mjs                  # esbuild 打包 server / sdk
│   ├── init-data-dirs.sh          # 初始化 data/ 目录并修正属主
│   ├── backup.sh                  # 全量备份（短暂停机打包）
│   └── restore.sh                 # 从备份恢复
├── src/
│   ├── server/                    # 采集/配置/告警记录服务（Hono + node:sqlite）
│   │   ├── index.ts               # 路由与鉴权
│   │   ├── config.ts              # 环境变量
│   │   ├── db.ts                  # SQLite：app_config / alert_records / alert_events
│   │   ├── metrics.ts             # prom-client 前端指标
│   │   ├── loki.ts                # 错误事件批量转发 Loki
│   │   └── routes/
│   │       ├── report.ts          # POST /api/v1/report（SDK 上报）
│   │       ├── config.ts          # /api/v1/config（业务配置 KV）
│   │       └── alerts.ts          # /api/v1/alerts（告警记录 + Grafana webhook）
│   ├── instrumentation/hono.ts    # 业务后端 API 埋点中间件（请求量/错误率/延迟）
│   └── sdk/                       # 前端监控 SDK（零依赖）
│       ├── index.ts               # initObservation：异常/API 追踪
│       ├── reporter.ts            # 批量上报 + sendBeacon 兜底
│       ├── performance.ts         # Web Vitals (LCP/FCP/TTFB/INP/CLS)
│       └── types.ts
└── deploy/                        # Docker Compose 部署目录
    ├── docker-compose.yml
    ├── .env.example               # 复制为 .env
    ├── prometheus/
    │   ├── prometheus.yml
    │   └── targets/backends.json  # 业务后端抓取目标（file_sd，改完自动生效）
    ├── loki/loki-config.yml
    ├── alloy/config.alloy
    └── grafana/
        ├── grafana.ini
        ├── dashboards/            # 预置 Dashboard：主机与容器 / 后端 API / 前端质量
        └── provisioning/
            ├── datasources/datasources.yml
            ├── dashboards/dashboards.yml
            └── alerting/          # 告警规则 / 联系点 / 通知策略
```

## 快速开始

> 前置要求：Linux VPS + Docker Engine（compose v2）。业务栈（`docker/docker-compose.yaml`）需先启动，监控栈会复用其网络 `quanta-challenge_quanta-challenge-network` 抓取后端 `/metrics`；独立部署时删除 compose 中 `app` 网络相关配置即可。

```bash
cd packages/challenge-observation

# 1. 准备环境变量
cp deploy/.env.example deploy/.env
vi deploy/.env   # 修改 GRAFANA_ADMIN_PASSWORD、OBS_API_TOKEN 等
# 注意：将 OBS_API_TOKEN 同步写入 deploy/grafana/provisioning/alerting/contact-points.yml
# 的 authorization_credentials（Grafana 告警 webhook 需要），否则告警无法落库

# 2. 初始化数据目录（Linux 上必须，修正容器属主）
bash scripts/init-data-dirs.sh

# 3. 启动监控栈
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build

# 4. 验证
docker compose -f deploy/docker-compose.yml ps
curl -s http://127.0.0.1:9310/healthz
```

访问 `http://<VPS-IP>:13000`（默认绑定 127.0.0.1，公网访问见「访问与鉴权」），账号为 `.env` 中的 `GRAFANA_ADMIN_USER/PASSWORD`。预置 Dashboard 在 **Observation** 文件夹：`主机与容器`、`后端 API`、`前端质量`。

## 数据持久化

所有监控数据通过 bind mount 保存到 `deploy/data/`：

| 目录 | 内容 | 属主 (uid) |
| --- | --- | --- |
| `data/prometheus` | 指标 TSDB | 65534 |
| `data/loki` | 日志 chunks/索引 | 10001 |
| `data/grafana` | Grafana SQLite（用户/告警/Dashboard） | 472 |
| `data/alloy` | 采集游标（防止重启重复采集） | root |
| `data/observation` | `observation.sqlite3`（业务配置 + 告警记录，WAL 模式） | 1000 |

保留期限（在 compose / 配置文件中调整）：

- Prometheus：`--storage.tsdb.retention.time=15d`、`--storage.tsdb.retention.size=5GB`
- Loki：`limits_config.retention_period: 336h`（14 天），compactor 自动清理
- SQLite（observation）：按需手动清理 `alert_events` 旧数据

## 资源限制与网络隔离

- **资源限制**：每个服务通过 `deploy.resources.limits` 限制（Prometheus 1C/1G、Loki 0.5C/768M、Grafana 0.5C/512M、Alloy/cadvisor 0.5C/256M、observation 0.3C/256M），整栈峰值约 3GB 内存，2C4G VPS 可承载。
- **网络隔离**：
  - `monitoring`（internal）：监控组件内部互通，不直接暴露公网；
  - `app`（external）：仅 Prometheus 与 observation 加入业务网络，用于抓取后端 `/metrics`；
  - 端口只在宿主机回环绑定：Grafana `127.0.0.1:13000`、observation `127.0.0.1:9310`。

## 访问与鉴权

- **Grafana**：管理员账号密码由 `.env` 注入；关闭注册（`allow_sign_up=false`）与匿名访问。公网使用请配置 Nginx/Caddy 反代 + TLS（`proxy_pass http://127.0.0.1:13000`），并可叠加 IP 白名单或 Basic Auth。
- **observation 管理接口**（`/api/v1/config`、`/api/v1/alerts`）：必须携带 `OBS_API_TOKEN`（`Authorization: Bearer <token>` 或 `x-obs-token` 头）。
- **上报接口**（`POST /api/v1/report`）：可选 `OBS_REPORT_TOKEN`，设置后 SDK 初始化时传 `token` 参数。公网部署建议开启，并注意报表接口防刷（可在反代层加限流）。
- 所有服务端口仅绑定 `127.0.0.1`，未经反代不会暴露到公网。

## 业务接入

> 三个业务服务（judge-scheduler / cloud-function / web-app）**均已接入**，以下为各自的接入方式与相关环境变量，供排查或新增服务时参考。

### 后端 API 指标（Hono 服务，已接入）

`challenge-judge-scheduler` 与 `challenge-cloud-function` 均已通过埋点中间件接入：

```ts
import { createApiInstrumentation } from '@challenge/observation/instrumentation'

const api = createApiInstrumentation({ service: 'challenge-judge-scheduler' })
app.use('*', api.middleware) // 放在所有业务路由之前
app.get('/metrics', api.metricsHandler)
```

抓取目标在 `deploy/prometheus/targets/backends.json` 中维护（file_sd，30s 自动刷新，无需重启），
当前包含 `challenge-judge-scheduler:1888`、`challenge-cloud-function:1890`、`challenge-web-app:3000`。

judge-scheduler 另有判题业务自有指标（`src/metrics/index.ts`）：

| 指标 | 类型 | 说明 |
| --- | --- | --- |
| `judge_queue_depth{queue,state}` | Gauge | BullMQ 队列各状态任务数（waiting/active/completed/failed/...） |
| `judge_machine_available{kind}` | Gauge | 判题机可用性，1/0；`kind=frontend` 与 `/health` 的 degraded 同源 |
| `judge_results_total{mode,outcome}` | Counter | 判题结果计数（pass / fail / error） |
| `judge_task_duration_seconds{mode,outcome}` | Histogram | 单个判题任务总耗时 |
| `judge_task_pending_seconds{mode}` | Histogram | 任务在队列中的等待时长 |

### 前端 SDK（web-app / Nuxt，已接入）

- 浏览器侧：`app/plugins/observation.client.ts` 调用 `initObservation`，采集 JS 异常 /
  Web Vitals（LCP / FCP / TTFB / INP / CLS）/ fetch+XHR API 追踪；
- 上报链路：SDK 同源上报到 Nitro 路由 `/api/observation/report`
  （`server/api/observation/report.post.ts`），由 web-app 服务端转发到 observation 服务
  —— 因为生产环境 observation 只绑定 `127.0.0.1:9310`，浏览器无法直连，也免去 CORS 与额外反代；
- 服务端侧：`server/middleware/metrics.ts` + `server/routes/metrics.get.ts` 提供
  Nitro HTTP 指标与 `/metrics` 抓取入口（指标名与 Hono 后端一致，Dashboard 直接复用）。

相关环境变量（web-app）：

| 变量名 | 说明 | 默认值 |
| --- | --- | --- |
| `OBSERVATION_SERVER_URL` | observation 服务地址（服务端转发用） | `http://localhost:9310`（生产 compose 注入 `http://observation:9310`） |
| `OBSERVATION_ENDPOINT` | 浏览器上报地址 | `/api/observation/report` |
| `OBSERVATION_SAMPLE_RATE` | 采样率 0-1 | `1` |
| `OBSERVATION_REPORT_TOKEN` | 与服务端 `OBS_REPORT_TOKEN` 一致的上报令牌（可选） | 空 |
| `RELEASE_VERSION` | 发布版本标识（git sha 等） | `dev` |

未部署监控栈时上报会静默失败（502 丢弃批次），不影响业务。

## 告警

- 规则：`deploy/grafana/provisioning/alerting/rules.yml`（Grafana 统一告警，无需 Alertmanager 组件），已内置：主机失联 / CPU / 内存 / 磁盘 / 容器重启 / API 5xx 错误率 / API P95 延迟 / 前端 JS 异常激增 / 判题机不可用（调度器 degraded）/ 判题队列积压 / 判题执行异常率；
- 记录：所有告警经 webhook（`contact-points.yml`）写入 observation 服务 SQLite（`alert_records` / `alert_events` 表），提供 REST 查询：

```bash
curl -H "Authorization: Bearer $OBS_API_TOKEN" http://127.0.0.1:9310/api/v1/alerts?status=firing
```

- 通知渠道扩展：在 Grafana UI 中可另行添加邮件/钉钉/飞书/Slack 联系点，与 webhook 并行。

## 备份与恢复

```bash
# 备份（打包 deploy/data，监控栈停机约数秒）
bash scripts/backup.sh              # 默认输出到 packages/challenge-observation/backups/

# 定时备份示例（crontab，每天 04:00，保留 7 份）
0 4 * * * cd /path/to/quanta-challenge/packages/challenge-observation && bash scripts/backup.sh

# 恢复
bash scripts/restore.sh backups/observation-backup-20260101-040000.tar.gz
```

建议将 `backups/` 目录纳入异地同步（rclone 到任意对象存储即可，监控栈本身不依赖远端存储）。

## 常用运维命令

```bash
cd packages/challenge-observation/deploy
docker compose ps                                   # 状态
docker compose logs -f prometheus                   # 排查某组件
curl -X POST http://127.0.0.1:9090/-/reload ...     # 需要在 compose 中为 prometheus 临时开启 --web.enable-lifecycle（已开启）
docker compose restart alloy                        # 修改 alloy 配置后生效
```

验证数据链路：

```bash
curl -s http://127.0.0.1:9310/metrics | grep frontend_errors_total   # 上报指标
docker compose exec prometheus wget -qO- 'http://loki:3100/ready'    # Loki 就绪
```

## 预留扩展路径

当前刻意未引入的东西与对应演进方向：

| 现状 | 扩展方向 |
| --- | --- |
| Alloy 仅采集容器日志 | Alloy 原生支持 `otelcol.*` 组件，新增 OTLP receiver（4317/4318）即可接收 Traces/Metrics |
| 无链路追踪 | 数据源已预留 `trace_id` 字段映射（Loki derivedFields）；单机追加 Tempo 单实例 + Grafana 数据源即可，SDK/服务端可平滑升级为 OTel 上报 |
| 本地文件系统存储 | Loki/Prometheus 配置均预留 `object_store` 抽象，未来可切换 S3 兼容存储 |
| 单节点 | 配置保持单 binary 模式，纵向扩容（加内存/磁盘）优先 |
