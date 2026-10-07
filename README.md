# Quanta 前端挑战

**Quanta 前端挑战** 是一个全栈在线编程挑战平台，专注于前端开发技能的实践与评测。平台提供基于浏览器的代码编辑环境、实时预览功能，以及自动化的 Playwright 评测系统。

## 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [开发指南](#开发指南)
- [部署说明](#部署说明)
- [环境变量](#环境变量)
- [许可证](#许可证)

## 项目概述

Quanta 前端挑战平台为开发者提供了一个交互式的编程练习环境。用户可以在浏览器中编写代码，实时预览效果，并通过自动化评测系统验证解决方案的正确性。

### 核心特性

- **在线代码编辑器**：基于 Monaco Editor 的专业级代码编辑体验
- **WebContainer 运行时**：浏览器内置 Node.js 运行时，支持实时预览
- **自动化评测**：基于 Playwright 的视觉回归测试和功能验证
- **题目管理系统**：支持多版本题目、难度分级、标签分类
- **用户系统**：完整的用户认证、成就系统、排行榜功能
- **每日挑战**：定期推送编程挑战，促进持续学习

### 数据流

1. 用户在浏览器中编写代码并提交
2. Web 应用将代码快照发送至评测调度器
3. 调度器创建 Live Server 容器运行用户代码
4. Judge Machine 使用 Playwright 访问并评测页面
5. 评测结果通过 WebSocket 返回并更新数据库
6. 用户收到评测反馈

## 技术栈

### 前端

| 技术 | 用途 |
|------|------|
| [Nuxt 4](https://nuxt.com/) | Vue 全栈框架，支持 SSR |
| [Vue 3](https://vuejs.org/) | 响应式 UI 框架 |
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | VS Code 同款代码编辑器 |
| [WebContainer](https://webcontainers.io/) | 浏览器内 Node.js 运行时 |
| [Tailwind CSS](https://tailwindcss.com/) | 原子化 CSS 框架 |
| [tRPC](https://trpc.io/) | 端到端类型安全 API |

### 后端

| 技术 | 用途 |
|------|------|
| [Hono](https://hono.dev/) | 轻量级 Web 框架 |
| [Prisma](https://www.prisma.io/) | 类型安全 ORM |
| [BullMQ](https://docs.bullmq.io/) | Redis 任务队列 |
| [Playwright](https://playwright.dev/) | 浏览器自动化测试 |
| [Docker](https://www.docker.com/) | 容器化部署 |

### 数据存储

| 技术 | 用途 |
|------|------|
| [PostgreSQL](https://www.postgresql.org/) | 关系型数据库 |
| [Redis](https://redis.io/) | 缓存与消息队列 |

## 项目结构

```
quanta-challenge/
├── docker/                          # Docker 编排配置
│   ├── docker-compose.yaml          # 生产环境配置
│   └── docker-compose.development.yaml  # 开发环境配置
├── packages/
│   ├── challenge-web-app/           # Web 应用 (Nuxt 4)
│   │   ├── app/                     # 前端源码
│   │   │   ├── components/          # Vue 组件
│   │   │   ├── composables/         # 组合式函数
│   │   │   ├── pages/               # 页面路由
│   │   │   └── stores/              # Pinia 状态管理
│   │   ├── server/                  # 服务端源码
│   │   │   ├── api/                 # API 端点
│   │   │   └── trpc/                # tRPC 路由
│   │   └── lib/                     # 工具库
│   ├── challenge-judge-scheduler/   # 评测调度服务 (Hono)
│   │   ├── src/
│   │   │   ├── controllers/         # HTTP 控制器
│   │   │   ├── mq/                  # 消息队列处理
│   │   │   └── services/            # 业务服务
│   │   └── README.md
│   ├── challenge-agents/            # 评测代理服务
│   │   ├── judge-machine/           # Playwright 评测机
│   │   │   ├── protocol/            # JRTP 传输协议
│   │   │   ├── src/                 # 评测逻辑
│   │   │   └── README.md
│   │   └── live-server/             # 用户代码运行容器
│   ├── database/                    # 数据库层
│   │   ├── prisma/                  # Prisma Schema
│   │   └── index.ts                 # 数据库客户端导出
│   ├── problem-creator-cli/         # 出题工具链 CLI（qpc）
│   │   ├── src/
│   │   │   ├── commands/            # init / check / upload / status / publish / login / doctor
│   │   │   ├── domain/              # 配置 schema、判题脚本静态分析、快照、预检规则
│   │   │   └── services/            # admin tRPC、judge API、凭据
│   │   ├── examples/hello-total/    # 示例题目（也是 e2e fixture）
│   │   └── README.md                # 用法与规则说明
│   └── shared/                      # 共享工具库
│       ├── configs/                 # 共享配置
│       ├── service/                 # 共享服务
│       └── utils/                   # 工具函数
├── package.json                     # 工作区配置
└── pnpm-workspace.yaml              # pnpm 工作区定义
```

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) >= 20.0.0
- [pnpm](https://pnpm.io/) >= 9.0.0
- [Docker](https://www.docker.com/) >= 24.0.0
- [Docker Compose](https://docs.docker.com/compose/) >= 2.0.0

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/still-soda/quanta-challenge.git
cd quanta-challenge

# 安装依赖
pnpm install
```

### 启动开发环境

#### 方式一：Docker Compose

> ⚠️ **必须先构建判题机镜像**（见下方第 0 步）。
>
> `docker/docker-compose*.yaml` 里的 `challenge-judge-machine-agent` 与
> `challenge-live-server-agent` 都带有 `profiles: [ignore]`，**Compose 不会构建它们**。
> 而调度器启动时会通过 Docker API 拉起 `challenge-judge-machine-agent` 容器，
> 镜像不存在则调度器初始化直接失败（所有判题停在 pending）。
> 这两个镜像由调度器在运行期按需创建，所以无法用 Compose 管理，只能预先构建。

```bash
# 0. 先构建两个判题相关镜像（只需在新环境首次部署，或这两处代码变更后执行）
pnpm --filter @challenge/judge-machine-agent docker:build
pnpm --filter @challenge/live-server-agent docker:build

# 1. 构建并启动 Web 应用、调度器、PostgreSQL、Redis
pnpm docker:up:dev

# 2. 查看服务日志
docker-compose -f docker/docker-compose.development.yaml logs -f
```

#### 方式二：本地开发

```bash
# 1. 启动 PostgreSQL 和 Redis（需要本地安装或使用 Docker）
docker run -d --name postgres -p 5432:5432 \
  -e POSTGRES_USER=quanta \
  -e POSTGRES_PASSWORD=quanta \
  -e POSTGRES_DB=quanta_db \
  postgres:16-alpine

docker run -d --name redis -p 6379:6379 redis:7-alpine

# 2. 初始化数据库
cd packages/database
pnpm prisma:update

# 3. 构建评测机镜像
cd ../challenge-agents/judge-machine
pnpm docker:build

cd ../live-server
pnpm docker:build

# 4. 启动 Web 应用（终端 1）
cd ../../challenge-web-app
pnpm dev

# 5. 启动评测调度器（终端 2）
cd ../challenge-judge-scheduler
pnpm dev
```

### 访问应用

- **Web 应用**: <http://localhost:3000>
- **评测调度器**: <http://localhost:1888>

## 开发指南

### 数据库迁移

修改 Prisma Schema 后，执行以下命令：

```bash
cd packages/database
pnpm prisma:update  # 执行迁移 + 生成客户端 + 更新映射
```

> ⚠️ **重要**: 切勿直接运行 `prisma migrate`，必须使用 `prisma:update` 以确保类型映射同步更新。

> 部署时不需要手工迁移：web 容器与判题调度器容器启动时都会先执行
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

- 使用 TypeScript 严格模式
- 遵循 ESLint 和 Prettier 配置（`problem-creator-cli` 使用 Biome，配置见包内 `biome.json`）
- 组件命名采用 PascalCase
- 组合式函数以 `use` 前缀命名

### 出题（problem-creator-cli）

出题流程已工具化为 `qpc`（脚手架 → 离线预检 → 上传 → 等审计 → 发布）。
在仓库根目录直接调用（`pnpm qpc` 等价于包内 `pnpm dev`，相对路径按仓库根解析）：

```bash
pnpm qpc init my-problem --name "购物车合计"   # 生成题目骨架
pnpm qpc check my-problem                      # 毫秒级预检（判题脚本/快照/分值）
pnpm qpc check my-problem --judge              # 再让调度器编译一次判题脚本
pnpm qpc login --device                        # 浏览器里授权登录（无需输入密码）
pnpm qpc upload my-problem --wait              # 上传并打印审计的检查点明细
pnpm qpc publish <pid>                         # 审计通过后发布
```

登录用 OAuth 2.0 设备授权流程（RFC 8628）：CLI 打印验证码并打开
`/auth/device`，你在页面上核对验证码、确认授权范围后点“同意”，
终端即完成登录。密码不经过 CLI。无浏览器环境加 `--no-browser` 手动完成。
协议细节与排查步骤见 `packages/problem-creator-cli/docs/OAUTH_DEVICE_FLOW.md`。

预检覆盖 `docs/PROBLEM_AUTHORING.md` 里所有可静态判定的坑（例如检查点忘记 `return`
分数会判 0 分、`page.click` 打到 disabled 按钮会卡 30 秒）。
用法与规则编号见 `packages/problem-creator-cli/README.md` 与其中的 `docs/RULES.md`。

## 部署说明

### 生产环境部署

```bash
# 构建所有镜像
pnpm docker:build

# 启动服务
pnpm docker:up

# 停止服务
pnpm docker:down
```

### 端口映射

| 服务 | 内部端口 | 外部端口 |
|------|----------|----------|
| Web 应用 | 3000 | 3000 |
| 评测调度器 | 1888 | - |
| PostgreSQL | 5432 | 25432 |
| Redis | 6379 | 26379 |

## 环境变量

### Web 应用 (challenge-web-app)

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgres://user:pass@host:5432/db` |
| `NUXT_REDIS_HOST` | Redis 主机地址 | `localhost` |
| `NUXT_JUDGE_SERVER_URL` | 评测服务地址 | `http://localhost:1888` |
| `SUPER_ACCOUNT` | 超级管理员账号 | `admin` |
| `SUPER_PASSWORD` | 超级管理员密码 | `admin123` |
| `SUPER_EMAIL` | 超级管理员邮箱 | `admin@example.com` |

### 评测调度器 (challenge-judge-scheduler)

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgres://user:pass@host:5432/db` |
| `REDIS_HOST` | Redis 主机地址 | `localhost` |
| `PORT` | 服务端口 | `1888` |

## 许可证

本项目采用 [MIT 许可证](LICENSE)。

---

<p align="center">
  <b>Quanta 前端挑战</b> - 让编程学习更高效
</p>
