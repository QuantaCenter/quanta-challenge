# @challenge/cloud-function（云函数服务）

Quanta Challenge 的云函数运行时（Hono + Node worker 线程池）。提供函数注册 / 版本管理 / 调用 / 在线测试、作用域 KV 存储与外部 API Key 管理。Web 应用与评测调度器通过内部密钥调用，外部调用方使用 API Key。

## 端点

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/healthz` | 无（探针用） | 实际 ping Redis 与 Postgres，依赖未就绪返回 503 |
| GET | `/metrics` | 无 | Prometheus 指标 |
| POST | `/v1/invoke/:name` | `invoke` | 调用指定函数 |
| GET / POST | `/v1/functions` | `read` / `manage` | 列出 / 创建函数 |
| GET / PATCH / DELETE | `/v1/functions/:name` | `read` / `manage` | 详情 / 更新 / 删除 |
| GET / POST | `/v1/functions/:name/versions` | `read` / `manage` | 版本列表 / 发布新版本 |
| GET / POST | `/v1/functions/:name/test…` | `read` / `manage` | 调用记录查询 / 在线测试 |
| GET / POST | `/v1/keys`、PATCH / DELETE `/v1/keys/:keyId` | `read` / `manage` | 外部 API Key 管理 |

`/v1/*` 全部经过签名校验中间件；scope 分 `invoke` / `read` / `manage` 三级。

## 鉴权

两类身份：

- **内部密钥**（`CF_INTERNAL_KEYS`，如 `web-app`、`judge`）：调用方用共享密钥对请求做 HMAC 签名（时间窗默认 5 分钟，`CF_SIGN_WINDOW_MS`）。`judge` 身份受 `CF_JUDGE_ALLOWED_FUNCTIONS` 白名单约束（空 = 判题不允许调用任何函数），scope 默认只有 `invoke`。
- **外部 API Key**（由 `CF_MASTER_SECRETS` 签发 / 校验）：供外部调用方使用，在 Web 应用管理页创建。

开发环境有 `dev_only_*` 兜底密钥开箱可用；**生产环境缺失 `CF_INTERNAL_KEYS` / `CF_MASTER_SECRETS` 时启动直接失败**，绝不静默降级。

## 函数执行

- `services/worker.ts`：worker 线程池（默认 4 个，每个 128MB 内存上限，处理 200 次调用后回收）
- `services/compiler.ts`：esbuild 编译用户源码
- `services/invocations.ts`：调用记录落库（默认保留 14 天，`CF_INVOCATION_RETENTION_DAYS`）
- 约束：单函数并发默认 16、单次调用超时默认 30s、响应体上限默认 256KB（均可用 `CF_*` 环境变量调整）

KV 存储基于 Redis，带配额：键长 / 值大小 / TTL / 每作用域键数与字节数 / 每次调用操作数与速率限制。

## 目录结构

```
challenge-cloud-function/
├── src/
│   ├── index.ts             # 入口：加载配置、启动 HTTP
│   ├── config.ts            # 环境变量与默认值（生产缺密钥启动即失败）
│   ├── controllers/         # health / invoke / functions / keys
│   ├── middlewares/         # 签名校验、trace
│   ├── services/            # registry / executor / compiler / invocations / kv / keys / redis
│   ├── runtime/             # worker 线程协议与实现
│   └── utils/               # logger / errors / prisma / ids
├── Dockerfile               # node 基础镜像，入口先 prisma migrate deploy
└── vite.config.ts
```

## 开发

```bash
pnpm dev       # vite 开发服务器
pnpm build     # vite build
pnpm start     # node dist/index.js
pnpm typecheck # tsc --noEmit
```

## 部署要点

- 端口 1890 在生产 Compose 中**只绑回环**（供部署 webhook 健康探测），业务调用走 Compose 内部网络
- 环境变量：`DATABASE_URL`、`REDIS_HOST`、`CF_INTERNAL_KEYS` / `CF_MASTER_SECRETS`（JSON）、`CF_INTERNAL_KEY_SCOPES`、`CF_JUDGE_ALLOWED_FUNCTIONS` 等，与 Web 应用 / 调度器侧的 `CF_SERVER` / `CF_INTERNAL_KEY_ID` / `CF_INTERNAL_SECRET` 成对配置
- 演示数据：`packages/database/scripts/seed-cloud-function-demo.mjs`
