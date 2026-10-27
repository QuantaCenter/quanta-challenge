# Quanta Challenge

Quanta Challenge 是一个在线编程挑战平台，支持前端与后端服务两类题型。用户在浏览器中编写代码并提交，由容器化的评测系统自动判分。

## 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [开发指南](#开发指南)
- [部署说明](#部署说明)
- [环境变量](#环境变量)
- [文档索引](#文档索引)

## 项目概述

平台由 Web 应用、评测调度器、云函数服务、判题容器镜像和监控栈组成，pnpm workspace 管理，全部使用 TypeScript。

### 功能

- **在线代码编辑器**：基于 Monaco Editor，前端题型通过 WebContainer 在浏览器内实时预览
- **自动化评测**：前端题型由 Playwright 判题机执行视觉回归与功能检查；后端服务题型由 HTTP 判题机对用户服务发请求断言
- **题目管理**：多版本题目、难度分级、标签分类；`qpc` CLI 覆盖出题到发布的完整流程
- **用户系统**：账号认证、成就、排行榜、通知
- **云函数服务**：函数注册 / 调用 / KV 存储，供 Web 应用与调度器通过内部密钥调用
- **监控栈**：Prometheus / Loki / Grafana 采集指标与日志，自研采集服务接收前端 SDK 上报

### 架构与判题数据流

```mermaid
flowchart LR
    U[浏览器] --> W[challenge-web-app<br/>Nuxt 4]
    W -- "提交代码快照" --> S[challenge-judge-scheduler<br/>Hono + BullMQ]
    S --> R[(Redis)]
    W --> P[(PostgreSQL)]
    S --> P

    subgraph agents [调度器按需创建的容器]
        LS[live-server<br/>运行用户静态站点]
        JM[judge-machine<br/>Playwright 判题机]
        BS[backend-service<br/>运行用户后端服务]
        BJ[backend-judge-machine<br/>HTTP 判题机]
    end

    S -- "Docker API" --> LS
    S -- "Docker API" --> JM
    S -- "Docker API" --> BS
    S -- "Docker API" --> BJ
    JM -- "访问页面评测" --> LS
    JM -- "WebSocket :1889 回传结果" --> S
    BJ -- "HTTP 请求断言" --> BS
    BJ -- "WebSocket :1891 回传结果" --> S
    S -- "回调同步排行榜与通知" --> W

    W -- "内部密钥调用 :1890" --> CF[challenge-cloud-function]
    S -- "内部密钥调用 :1890" --> CF

    W & S & CF -- "指标 / 日志上报" --> OBS[challenge-observation]
```

前端题型与后端题型使用不同链路：前端题型走 `live-server` + `judge-machine`（Playwright），后端题型走 `backend-service` + `backend-judge-machine`（无 Playwright）。两者任务信封与回包格式一致。判题机镜像不在 Compose 编排内，由调度器在运行期通过 Docker API 创建，因此需要预先构建。

## 技术栈

### 前端与 Web 应用

| 技术 | 用途 |
|------|------|
| [Nuxt 4](https://nuxt.com/) / Vue 3 | Web 应用框架 |
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | 代码编辑器 |
| [WebContainer](https://webcontainers.io/) | 浏览器内 Node.js 运行时（前端题型预览） |
| [Tailwind CSS](https://tailwindcss.com/) | CSS 框架 |
| [tRPC](https://trpc.io/) | 端到端类型安全 API |
| Pinia | 状态管理 |

### 服务端

| 技术 | 用途 |
|------|------|
| [Hono](https://hono.dev/) | 调度器、云函数、采集服务的 Web 框架 |
| [Prisma](https://www.prisma.io/) | ORM（PostgreSQL） |
| [BullMQ](https://docs.bullmq.io/) | Redis 任务队列（判题任务调度） |
| [Playwright](https://playwright.dev/) | 前端题型判题 |
| prom-client | 指标暴露 |

### 基础设施

| 技术 | 用途 |
|------|------|
| [PostgreSQL](https://www.postgresql.org/) 16 | 主数据库 |
| [Redis](https://redis.io/) 7 | 队列与缓存 |
| [Docker](https://www.docker.com/) / Compose | 容器化部署，判题沙箱 |
| Prometheus / Loki / Grafana / Alloy | 监控栈（见 `packages/challenge-observation`） |

## 项目结构

```
quanta-challenge/
├── ci/                              # 部署机侧：镜像发布 webhook（拉 GHCR 镜像、重启容器、失败回滚）
├── docs/                            # 部署、题目编写、镜像 webhook 等文档
├── scripts/                         # 仓库级脚本（CI 发布通知、本地开发辅助）
├── docker/
│   ├── docker-compose.yaml          # 生产环境编排
│   └── docker-compose.development.yaml
├── packages/
│   ├── challenge-web-app/           # Web 应用（Nuxt 4）
│   │   ├── app/                     # 前端源码（components / composables / pages / stores）
│   │   ├── server/                  # Nitro 服务端（API 路由 + tRPC 路由）
│   │   └── lib/                     # 工具库
│   ├── challenge-judge-scheduler/   # 评测调度服务（Hono + BullMQ，端口 1888）
│   ├── challenge-cloud-function/    # 云函数服务（Hono，端口 1890，仅容器网络内 / 回环）
│   ├── challenge-observation/       # 监控栈与自研采集服务（采集端口 9310，独立 Compose 部署）
│   ├── challenge-agents/            # 判题相关容器镜像
│   │   ├── judge-machine/           # 前端题型判题机（Playwright）
│   │   ├── live-server/             # 前端题型：用户静态站点运行容器
│   │   ├── backend-service/         # 后端题型：题目容器镜像（Node 24）
│   │   └── backend-judge-machine/   # 后端题型：HTTP 判题机
│   ├── database/                    # Prisma Schema 与数据库客户端
│   ├── problem-creator-cli/         # 出题工具链 CLI（qpc）
│   └── shared/                      # 共享工具库
├── package.json
└── pnpm-workspace.yaml
```

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9
- [Docker](https://www.docker.com/) >= 24 与 Docker Compose v2

### 安装

```bash
git clone https://github.com/still-soda/quanta-challenge.git
cd quanta-challenge
pnpm install
```

### 方式一：Docker Compose（开发环境）

> ⚠️ 必须先构建判题相关镜像。`docker/docker-compose*.yaml` 里的
> `challenge-judge-machine-agent` 与 `challenge-live-server-agent` 都带有
> `profiles: [ignore]`，Compose 不会构建它们；而调度器启动时会通过 Docker API
> 拉起这些容器，镜像不存在则调度器初始化直接失败（所有判题停在 pending）。

```bash
# 0. 构建判题相关镜像（新环境首次部署，或对应代码变更后）
pnpm --filter @challenge/judge-machine-agent docker:build
pnpm --filter @challenge/live-server-agent docker:build

# 0.5 可选：后端题型需要额外两个镜像；只有存在后端题目时才需要
pnpm --filter @challenge/backend-service-agent docker:build
pnpm --filter @challenge/backend-judge-machine-agent docker:build

# 1. 启动 Web 应用、调度器、云函数、PostgreSQL、Redis
pnpm docker:up:dev

# 2. 查看日志
docker-compose -f docker/docker-compose.development.yaml logs -f
```

### 方式二：本地开发

```bash
# 1. 启动 PostgreSQL 和 Redis（本地安装或 Docker）
docker run -d --name postgres -p 5432:5432 \
  -e POSTGRES_USER=quanta \
  -e POSTGRES_PASSWORD=quanta \
  -e POSTGRES_DB=quanta_db \
  postgres:16-alpine

docker run -d --name redis -p 6379:6379 redis:7-alpine

# 2. 初始化数据库
cd packages/database
pnpm prisma:update

# 3. 构建评测相关镜像
cd ../challenge-agents/judge-machine && pnpm docker:build
cd ../live-server && pnpm docker:build

# 可选：后端题型所需镜像，见 docs/BACKEND_SERVICE_PROBLEM.md
cd ../backend-service && pnpm docker:build
cd ../backend-judge-machine && pnpm docker:build

# 4. 启动 Web 应用（终端 1）
cd ../../challenge-web-app
pnpm dev

# 5. 启动评测调度器（终端 2）
cd ../challenge-judge-scheduler
pnpm dev
```

> **只开发后端题型？** `judge-machine` 镜像（带 Playwright，体积大、构建慢）可以跳过：
> 调度器在镜像不存在时会降级运行（启动只打 WARN，`/health` 返回 `status: degraded`），
> 前端题型提交会以 `Judge machine WebSocket is not connected` 明确失败，后端题型不受影响。
> 需要前端判题时再补 `pnpm --filter @challenge/judge-machine-agent docker:build`。
> 若镜像存在但 1889 端口被占、容器起不来，可设 `JUDGE_MACHINE_OPTIONAL=1` 同样降级。

### 访问

- Web 应用：<http://localhost:3000>
- 评测调度器：本地开发 <http://localhost:1888>（Compose 编排内为内部服务，不发布宿主机端口）
- 云函数服务：端口 1890，仅绑定回环 / 容器网络

## 开发指南

### 数据库迁移

修改 Prisma Schema 后：

```bash
cd packages/database
pnpm prisma:update  # 执行迁移 + 生成客户端 + 更新映射
```

> ⚠️ 切勿直接运行 `prisma migrate`，必须使用 `prisma:update` 以确保类型映射同步更新。
>
> 部署时不需要手工迁移：web 容器与调度器容器启动时都会先执行
> `prisma migrate deploy`（幂等、带 advisory lock，同时跑也安全），
> 详见 `packages/challenge-web-app/scripts/docker-entrypoint.sh`。

### 添加新的 tRPC 端点

1. 在 `packages/challenge-web-app/server/trpc/routes/` 下创建路由文件
2. 在对应的 `index.ts` 中导出路由
3. 前端调用方式：

```typescript
const { $trpc } = useNuxtApp();
const result = await $trpc.protected.myEndpoint.query();
```

### 代码规范

- TypeScript 严格模式
- ESLint + Prettier（`problem-creator-cli` 使用 Biome，配置见包内 `biome.json`）
- 组件命名 PascalCase，组合式函数以 `use` 前缀命名
- 类型检查：仓库根目录 `pnpm typecheck`

### 出题（problem-creator-cli）

出题流程工具化为 `qpc`（脚手架 → 离线预检 → 上传 → 等审计 → 发布）。
在仓库根目录调用（`pnpm qpc` 等价于包内 `pnpm dev`，相对路径按仓库根解析）：

```bash
pnpm qpc init my-problem --name "购物车合计"   # 生成前端题骨架（默认）
pnpm qpc init my-api --type backend_service   # 生成后端服务题骨架
pnpm qpc check my-problem                      # 毫秒级预检（判题脚本/快照/分值）
pnpm qpc login                                 # OAuth 2.0 设备码授权（RFC 8628）
pnpm qpc upload my-problem --wait              # 上传并打印审计检查点明细
pnpm qpc publish <pid>                         # 审计通过后发布
```

登录用设备授权流程：CLI 打印验证码并打开 `/auth/device`，在页面上确认授权后终端完成登录，
密码不经过 CLI。细节见 `packages/problem-creator-cli/docs/OAUTH_DEVICE_FLOW.md`。

预检覆盖 `docs/PROBLEM_AUTHORING.md` 中所有可静态判定的问题（例如检查点忘记 `return`
分数会判 0 分、`page.click` 打到 disabled 按钮会卡 30 秒）。规则编号见
`packages/problem-creator-cli/docs/RULES.md`。

## 部署说明

### 单机 Compose 部署

```bash
# 构建所有镜像
pnpm docker:build

# 启动服务
pnpm docker:up

# 停止服务
pnpm docker:down
```

生产 Compose 中的 `${...:?}` 变量（管理员账号、JWT 密钥、云函数内部密钥、webhook 签名密钥等）
必须通过 `.env` 提供。容量规划见 `docs/DEPLOY_SIZING.md`，核心流程见 `docs/CORE_DEPLOY.md`。

### CI/CD

CI 构建镜像推送到 GHCR 后回调部署机的 webhook（`ci/deploy-webhook.mjs`），
由其按 digest 拉取镜像、重打标签、`docker compose up -d` 只重启变化的服务，
失败自动回滚。契约见 `docs/IMAGE_WEBHOOK.md`，部署与运维见 `ci/README.md`。

### 端口

| 服务 | 容器端口 | 宿主机端口 | 说明 |
|------|----------|------------|------|
| Web 应用 | 3000 | 3000 | |
| 评测调度器 | 1888 | 未发布 | 仅 Compose 网络内可达 |
| 云函数服务 | 1890 | 127.0.0.1:1890 | 只绑回环，供 webhook 健康探测 |
| PostgreSQL | 5432 | 25432 | |
| Redis | 6379 | 26379 | |
| 前端判题机 | 1889 | 宿主机 1889 | 调度器运行期创建，经 `host.docker.internal` 连接 |
| 后端判题机 | 1891 | 宿主机 1891 | 同上 |
| 采集服务（observation） | 9310 | 127.0.0.1:9310 | 独立 Compose（`packages/challenge-observation/deploy`） |

## 环境变量

变量名以 `docker/docker-compose.yaml` 为准。

### challenge-web-app

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgres://user:pass@host:5432/db` |
| `REDIS_HOST` | Redis 主机 | `redis` |
| `APP_SERVER` | 站点对外地址（影响 cookie 等） | `https://your-domain.example` |
| `JUDGE_SERVER` | 调度器地址 | `http://challenge-judge-scheduler:1888` |
| `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` | JWT 签名密钥（运行时注入） | - |
| `SUPER_ACCOUNT` / `SUPER_PASSWORD` / `SUPER_EMAIL` | 超级管理员账号 | - |
| `CF_SERVER` / `CF_INTERNAL_KEY_ID` / `CF_INTERNAL_SECRET` | 云函数服务地址与内部密钥 | - |
| `OBSERVATION_SERVER_URL` | 采集服务地址（前端上报转发用） | `http://observation:9310` |
| `OBSERVATION_REPORT_TOKEN` | 上报令牌（与监控栈 `OBS_REPORT_TOKEN` 一致，可选） | - |
| `RELEASE_VERSION` | 发布版本标识（前端监控打标用） | - |

> Nuxt build 会把 `runtimeConfig` 烘焙为字面量，运行时只有 `NUXT_` 前缀的变量能覆盖
> （如 `NUXT_OBSERVATION_SERVER_URL`），Compose 文件中已同时注入对应键。

### challenge-judge-scheduler

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgres://user:pass@host:5432/db` |
| `REDIS_HOST` | Redis 主机 | `redis` |
| `PORT` | 服务端口 | `1888` |
| `APP_SERVER_URL` | Web 应用地址（判题后回调同步排行榜与通知） | `http://challenge-web-app:3000` |
| `OPENAPI_WEBHOOK_SECRET` | 回调签名密钥（与 Web 应用共享） | - |
| `JUDGE_MACHINE_WS_URL` | 前端判题机 WebSocket 地址 | `ws://host.docker.internal:1889/link` |
| `BACKEND_JUDGE_MACHINE_WS_URL` | 后端判题机 WebSocket 地址 | `ws://host.docker.internal:1891/link` |
| `CF_SERVER` / `CF_INTERNAL_KEY_ID` / `CF_INTERNAL_SECRET` | 云函数服务地址与内部密钥 | - |
| `TEMP_DIR` | 判题快照目录（须与宿主机共享同一 bind mount 路径） | `/app/tmp` |
| `PNPM_CACHE_DIR` | 共享 pnpm 缓存目录 | `/app/pnpm-cache` |
| `PNPM_CACHE_PROBLEM_IMAGE` | 缓存预热/门禁用的题目容器镜像（可选） | - |
| `JUDGE_MACHINE_OPTIONAL` | 置 `1` 时前端判题机不可用也允许启动（降级） | - |

## 文档索引

| 文档 | 内容 |
|------|------|
| [`docs/PROBLEM_AUTHORING.md`](docs/PROBLEM_AUTHORING.md) | 题目编写规范 |
| [`docs/BACKEND_SERVICE_PROBLEM.md`](docs/BACKEND_SERVICE_PROBLEM.md) | 后端服务题型：沙箱能力、判题协议 |
| [`docs/CORE_DEPLOY.md`](docs/CORE_DEPLOY.md) | 核心部署流程 |
| [`docs/DEPLOY_SIZING.md`](docs/DEPLOY_SIZING.md) | 部署资源规划 |
| [`docs/IMAGE_WEBHOOK.md`](docs/IMAGE_WEBHOOK.md) | 镜像发布 webhook 报文契约与签名 |
| [`docs/PNPM_CACHE.md`](docs/PNPM_CACHE.md) | 判题共享 pnpm 缓存 |
| [`ci/README.md`](ci/README.md) | 部署机 webhook 的部署与运维 |
| [`packages/challenge-judge-scheduler/README.md`](packages/challenge-judge-scheduler/README.md) | 调度器细节 |
| [`packages/challenge-agents/judge-machine/README.md`](packages/challenge-agents/judge-machine/README.md) | 判题机与 JRTP 协议 |
| [`packages/problem-creator-cli/README.md`](packages/problem-creator-cli/README.md) | 出题工具链用法与规则 |
| [`packages/challenge-observation/README.md`](packages/challenge-observation/README.md) | 监控栈架构与接入 |
