# 云函数系统设计方案（challenge-cloud-function）

> 状态：**设计稿**（v1，待评审）
> 目标读者：平台后端 / 判题系统 / 运维
> 关联包：`packages/challenge-cloud-function`（本方案新增）、`packages/challenge-web-app`、`packages/challenge-judge-scheduler`、`packages/challenge-agents/*`、`packages/shared`、`packages/database`

---

## 1. 背景与目标

平台已有「题目 → 提交 → 判题 → 成就/排行榜」的完整链路，但**业务侧的可扩展点**目前是硬编码的：
任何"根据运行时数据做点额外逻辑"的需求（比如某个活动的积分换算、某类成就的动态判定、判题后
的二次加工），都要改 `challenge-web-app` 源码、重新构建镜像、重启服务。

本方案引入一套**云函数系统**：管理层把一小段 JS/TS 逻辑"发布"上去，成员/内部服务通过 HTTP
调用即可执行，无需改主干代码、无需重新部署。

### 1.1 目标（v1 必须满足）

| 编号 | 目标 |
|---|---|
| G1 | **管理层发布**：管理员可创建 / 更新 / 发布新版本 / 回滚 / 停用云函数 |
| G2 | **任意成员调用**：登录用户可调用被授权调用的云函数 |
| G3 | **仅支持 JS/TS**：源码为 TS（或 JS），发布时编译，运行时限时执行 |
| G4 | **Redis 受限 KV**：云函数内可直接读写 KV；支持**可选的自动用户隔离** |
| G5 | **API Key 签名鉴权**：所有调用走统一的"密钥 + 签名"链路 |
| G6 | **内部自动认证**：站点（web-app）与判题环境无需人工签发密钥即可通过鉴权 |

### 1.2 非目标（v1 明确不做）

- ❌ 运行任意 npm 依赖 / 网络访问（`fetch`、`require` 全部禁用）。需要外部能力的场景由平台提供
  受控的 `ctx` 能力（见 §7），而不是放开沙箱。
- ❌ 成员自助发布函数。**只有管理员能发布**——这一点直接决定了沙箱的安全等级（见 §3.4、§15）。
- ❌ 定时触发 / 事件触发 / 队列消费者。v1 只有"HTTP 同步调用"。
- ❌ 多语言运行时（Node/Python/Go…）。
- ❌ 多租户级别的物理隔离。v1 是"单实例 + 逻辑隔离"。

### 1.3 关键约束（来自现有仓库）

- 现有服务间通信已经有**一套签名约定**：`packages/shared/service/openapi/sign.ts`
  （`generateOpenApiSign` / `verifyOpenApiSign`，`sha256(path?params+timestamp+secret)`），
  被 `challenge-judge-scheduler` 回调 web-app 的 webhook 使用。本方案的签名规范是它的**超集**，
  复用同一目录风格与 `@challenge/shared` 导出方式，避免仓库里出现两套互不相干的"签名"。
- `web-app` 已用 `ioredis` 且 runtimeConfig 里有 `redis` 配置；判题调度器同样连同一个 Redis。
  **复用现有 Redis 实例**，但通过独立 key 前缀与独立逻辑库（可选）与业务缓存隔离。
- 数据库 schema 集中在 `packages/database/prisma/schema.prisma`，云函数的元数据表并入其中，
  由同一个 Prisma Client 访问，不引入第二个 ORM / 第二套迁移。
- 端口约定：web-app=3000，判题调度器=1888，判题机=1889。云函数服务取 **1890**。

---

## 2. 术语

| 术语 | 含义 |
|---|---|
| 云函数 / Function | 一段以名字为标识的、可被调用的 JS/TS 逻辑，逻辑上等于一个"命名空间" |
| 版本 / Version | 某次发布的不可变源码快照（编译产物 + hash）；函数通过 `activeVersion` 指向当前生效版本 |
| 调用 / Invoke | 一次同步执行请求，携带 `input`，返回函数返回值 |
| 调用方 / Caller | 发起调用的主体：内部服务（web-app / 判题）或持有 API Key 的外部集成 |
| 隔离域 / Scope | KV 的命名空间维度。用户隔离时为 `u:<userId>`，否则为函数级共享 `s` |
| 内部密钥 / Internal Key | 由部署环境注入、不由管理员签发的密钥；用于站点与判题环境的"自动认证" |

---

## 3. 总体架构

### 3.1 组件图

```
┌──────────────────────────────────────────────────────────────────────┐
│                              浏览器 / 成员                              │
│   做题页 / 个人空间 / 活动页  ──(Nuxt SSR 或 客户端 fetch)──┐             │
└────────────────────────────────────────────────────────────┼─────────┘
                                                              │ 用户会话
                                                              │ (cookie: quanta_access_token)
                                                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  challenge-web-app (:3000)                                             │
│   · tRPC: protected.cloudFunction.invoke   ← 成员调用入口（带用户身份）    │
│   · tRPC: admin.cloudFunction.*            ← 管理入口（发布/回滚/发密钥）  │
│   · server/utils/cloud-function-client.ts  ← 统一"带签名"的出站客户端     │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  HTTP + HMAC 签名（内部密钥，自动认证）
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  challenge-cloud-function (:1890)   ← 本方案新增，仅内网可达             │
│                                                                        │
│  ① 鉴权中间件   验签 / 防重放 / scope 检查                               │
│  ② 注册表       函数 & 版本 & API Key（Postgres）                        │
│  ③ 执行引擎     Worker 池 + node:vm 沙箱 + 超时/内存限制                  │
│  ④ KV 网关      受限 KV 的**唯一**实现，所有 key 拼接在这里完成            │
│  ⑤ 观测        调用日志 / 指标 / traceId                                 │
└───────┬───────────────────────────────────────┬──────────────────────┘
        │ 受限命令（get/set/...，无原始命令）        │ 元数据
        ▼                                       ▼
┌────────────────────┐                  ┌──────────────────────────────┐
│  Redis (现有实例)   │                  │  Postgres (现有实例)           │
│  cf:kv:* 数据       │                  │  cloud_functions 等表         │
│  cf:rl:* 限流       │                  └──────────────────────────────┘
│  cf:nonce:* 防重放  │
└────────────────────┘
        ▲
        │  HTTP + HMAC 签名（内部密钥，自动认证）
┌───────┴──────────────────────────────────────────────────────────────┐
│  判题环境：challenge-judge-scheduler (:1888) / judge-machine (:1889)   │
│   判题完成后可调用云函数做二次加工（如动态加分、发通知）                  │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流（成员调用）

1. 成员在 web-app 页面触发调用 → 客户端调用 tRPC `protected.cloudFunction.invoke`。
2. web-app 从**会话 cookie**解析出真实 `userId`（**不可由前端传入**）。
3. `cloud-function-client` 用**内部密钥**生成签名，POST `/v1/invoke/:name`，
   并把 `x-cf-user-id` 一并纳入签名。
4. 云函数服务验签 → 加载 `activeVersion` → 在沙箱中执行。
5. 云函数通过 `ctx.kv` 读写 KV：**key 的拼接在云函数服务（④）完成**，沙箱只能拿到带前缀的
   结果，无法构造越界 key。
6. 返回值原样回传 → tRPC 返回给页面。

### 3.3 数据流（管理发布）

1. 管理员在后台填入函数名 / 描述 / TS 源码 / KV 隔离配置。
2. tRPC `admin.cloudFunction.publish` → 签名调用 `POST /v1/functions/:name/versions`
   （内部密钥 `web-app`，但该内部密钥**带 `manage` scope**；见 §6.4）。
3. 云函数服务用 esbuild 编译，落库为一个新版本，并按需切换 `activeVersion`。
4. 发布后通过一个"版本号"作为缓存 key，各实例在下次调用时自动热更新。

### 3.4 信任边界与威胁模型（**这是整个沙箱设计的依据**）

> **发布者是管理员，调用者才是普通成员。**

因此：

- **沙箱要防的第一目标不是"恶意代码夺取宿主机"**，而是：
  1. 一个函数**读/写另一个函数**或**另一个用户**的 KV 数据；
  2. 一个函数**吃满资源**导致整个云函数服务不可用（死循环、内存膨胀）；
  3. 函数通过 `ctx` 传入的**伪造身份**冒充别的用户。
- "沙箱逃逸"是**次要**目标：代码来自管理员。v1 用 `worker_threads` + `node:vm` + 资源限额，
  在威胁模型内足够。**若未来开放成员自助发布，必须换成 `isolated-vm` 或独立进程/容器**，
  这一点在 §15 与 §18 中显式标注，避免后续误以为现有沙箱能承载不可信代码。

---

## 4. 目录与包结构

```
packages/challenge-cloud-function/
├── DESIGN.md                     # 本文档
├── package.json                  # @challenge/cloud-function
├── tsconfig.json
├── vite.config.ts                # 与 judge-scheduler 同构：vite build → dist/index.js
├── Dockerfile
├── docs/
│   └── FUNCTION_AUTHORING.md     # 面向管理员的云函数编写规范（ctx API / 限制）
└── src/
    ├── index.ts                  # 入口：dotenv → init(redis/prisma/workerPool) → serve(:1890)
    ├── config.ts                 # 环境变量集中解析（含必填校验，参考 validate-secrets 的思路）
    ├── controllers/
    │   ├── index.ts              # Hono app + 路由挂载
    │   ├── health.ts             # GET /healthz
    │   ├── invoke.ts             # POST /v1/invoke/:name
    │   ├── functions.ts          # /v1/functions* 管理 API
    │   └── keys.ts               # /v1/keys*    密钥管理 API
    ├── middlewares/
    │   ├── signature.ts          # 验签 + 防重放 + 解析 caller
    │   └── scope.ts              # scope 校验（invoke / read / manage）
    ├── services/
    │   ├── registry.ts           # 函数/版本读取 + 内存 L1 缓存 + 失效
    │   ├── compiler.ts           # esbuild 编译 TS → 单文件 CJS bundle
    │   ├── executor.ts           # Worker 池调度、超时、并发控制
    │   └── kv.ts                 # 受限 KV 网关（key 拼接 / 配额 / 白名单命令）
    ├── runtime/
    │   ├── worker.ts             # Worker 线程：建 vm context、注入 RPC shim、执行
    │   └── sandbox-globals.ts    # 沙箱内暴露的白名单全局对象
    ├── schemas/                  # zod（与仓库其它服务一致）
    ├── utils/
    │   ├── sign.ts               # 复用 @challenge/shared/cloud-function 的校验实现
    │   ├── errors.ts             # 统一错误码
    │   └── logger.ts
    └── __tests__/
```

`packages/shared` 增加一个可被两端复用的签名模块：

```
packages/shared/service/cloud-function/sign.ts   →  导出 "./cloud-function": "./service/cloud-function/sign.ts"
```

web-app 侧新增：

```
packages/challenge-web-app/server/utils/cloud-function-client.ts
packages/challenge-web-app/server/trpc/routes/protected/cloud-function.ts   # 成员调用
packages/challenge-web-app/server/trpc/routes/admin/cloud-function.ts       # 管理入口
```

---

## 5. 数据模型

在 `packages/database/prisma/schema.prisma` 中新增（命名与现有表风格一致：模型 PascalCase，`@@map` 蛇形复数）。

```prisma
/// 云函数（逻辑命名空间，指向一个 activeVersion）
model CloudFunction {
  id            String   @id @default(cuid())
  name          String   @unique              // 调用标识，^[a-z][a-z0-9-]{0,62}$
  description   String   @default("")
  enabled       Boolean  @default(true)       // 停用后拒绝调用（但历史与版本保留）
  /// KV 是否按调用用户自动隔离。
  /// true ：每个 userId 一份独立命名空间（默认，最安全）
  /// false：所有调用者共享该函数的命名空间（用于全局计数器、缓存等）
  kvUserIsolated Boolean @default(true)
  /// 单次调用超时（毫秒），有硬上限 CF_MAX_TIMEOUT_MS
  timeoutMs     Int      @default(5000)
  /// 单次调用返回体上限（字节）
  maxResponseBytes Int   @default(262144)
  activeVersionId String? @unique
  createdBy     String                        // userId
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  activeVersion CloudFunctionVersion? @relation("activeVersion", fields: [activeVersionId], references: [id])
  versions      CloudFunctionVersion[] @relation("versions")
  apiKeys       CloudFunctionApiKey[]

  @@map("cloud_functions")
}

/// 不可变的版本快照
model CloudFunctionVersion {
  id           String   @id @default(cuid())
  functionId   String
  /// 自增版本号（同一函数内递增），用于展示与回滚
  version      Int
  source       String                          // 原始 TS/JS 源码（便于审计与再次编辑）
  compiledCode String                          // esbuild 产物（单文件 CJS）
  sourceHash   String                          // sha256(source)，用于"内容未变则不新建版本"
  createdBy    String
  createdAt    DateTime @default(now())

  function CloudFunction @relation("versions", fields: [functionId], references: [id], onDelete: Cascade)
  activeFor CloudFunction? @relation("activeVersion")

  @@unique([functionId, version])
  @@map("cloud_function_versions")
}

/// API Key（不含任何明文/加密 secret，见 §6.3 的派生方案）
model CloudFunctionApiKey {
  id           String   @id @default(cuid())
  keyId        String   @unique              // 公开的标识，如 cfk_7Qx...
  name         String
  scopes       String[]                      // ["invoke"] | ["invoke","read"] | ["manage",...]
  enabled      Boolean  @default(true)
  /// 可选：限定该 key 只能调用哪些函数（空数组 = 不限制）
  allowedFunctions String[] @default([])
  /// 派生密钥所使用的主密钥版本；轮换时改这里
  masterVersion Int      @default(1)
  createdBy    String
  lastUsedAt   DateTime?
  expiresAt    DateTime?
  createdAt    DateTime @default(now())

  cloudFunctionId String?
  cloudFunction   CloudFunction? @relation(fields: [cloudFunctionId], references: [id])

  @@map("cloud_function_api_keys")
}

/// 调用记录（审计 + 排障）。有保留期，由清理任务删除。
model CloudFunctionInvocation {
  id          String   @id @default(cuid())
  functionId  String
  versionId   String
  callerType  String                          // internal | apiKey
  callerKeyId String?                          // 内部为 "web-app"/"judge"，外部为 keyId
  userId      String?                          // 调用者用户（可为空）
  status      String                           // success | error | timeout | oom | rejected
  errorCode   String?
  durationMs  Int
  inputBytes  Int      @default(0)
  outputBytes Int      @default(0)
  traceId     String?
  createdAt   DateTime @default(now())

  @@index([functionId, createdAt])
  @@index([userId, createdAt])
  @@map("cloud_function_invocations")
}
```

> 说明：
> - **不把 KV 数据放 Postgres**。KV 的量级与访问模式是 Redis 的强项，Postgres 只存"元数据"。
> - **版本不可变**：`source` / `compiledCode` 一旦写入不修改；回滚 = 把 `activeVersionId` 指回旧版本。
> - `sourceHash` 支持"源码没变就不造新版本"，避免后台反复点"发布"产生噪音版本。

---

## 6. 鉴权与签名设计

### 6.1 设计原则

1. **一切调用都签名**（包括内部服务）。不使用"内网就免签"的旁路——那会变成一票绕过点。
2. **内部服务"自动认证"的含义** = 密钥由**部署配置注入**，无需管理员在后台手动签发/导入。
   对代码而言，它只是"从环境变量读到 key，然后正常签名"。
3. **密钥绝不进入浏览器**。站点调用由 Nuxt 服务端代理（浏览器 → tRPC → 服务端签名 → 云函数）。
4. **签名覆盖身份**：`x-cf-user-id` 也在签名串里，防止中间人/上游伪造用户身份。

### 6.2 签名规范（`@challenge/shared/cloud-function/sign.ts`）

请求头：

| Header | 说明 |
|---|---|
| `x-cf-key-id` | 密钥标识（内部：`web-app` / `judge`；外部：`cfk_xxx`） |
| `x-cf-timestamp` | Unix 毫秒时间戳字符串 |
| `x-cf-nonce` | 每次请求唯一的随机串（≥16 字节，base64url） |
| `x-cf-signature` | 十六进制 HMAC-SHA256 |
| `x-cf-user-id` | 可选。调用代表的用户；**不参与调用方身份**，但参与签名 |
| `x-trace-id` | 复用现有链路追踪头 |

规范化串（`\n` 连接，任何字段缺失用空串）：

```
METHOD
PATH                     // 不含 query，如 /v1/invoke/daily-bonus
SORTED_QUERY             // k=v&k2=v2，按 key 排序；无 query 时为空
SHA256_HEX(BODY_BYTES)   // 无 body 时为空串
TIMESTAMP
NONCE
USER_ID
```

```
signature = hex( HMAC_SHA256( secret, canonical ) )
```

客户端实现（内部服务自动使用）：

```ts
import { generateCloudFunctionSign } from '@challenge/shared/cloud-function';

const headers = generateCloudFunctionSign({
  method: 'POST',
  path: '/v1/invoke/daily-bonus',
  query: {},
  body: JSON.stringify({ input }),
  keyId: config.cloudFunction.keyId,      // 来自环境变量，自动注入
  secret: config.cloudFunction.secret,    // 来自环境变量，自动注入
  userId: ctx.user.userId,                // 参与签名
});
```

服务端校验（`middlewares/signature.ts`）：

1. `TIMESTAMP` 与服务器时间差须在 `CF_SIGN_WINDOW_MS`（默认 300000 = 5min）内。
2. `keyId` 解析出 secret：
   - 命中**内部密钥表**（环境变量）→ 直接取；
   - 否则查 `cloud_function_api_keys` → 派生（§6.3），并校验 `enabled / expiresAt / scopes / allowedFunctions`。
3. 重算签名，使用 **timing-safe 比较**（`crypto.timingSafeEqual`）。
4. **防重放**：`SET cf:nonce:<keyId>:<nonce> 1 NX EX <window/1000>`，已存在则拒绝。
5. 解析出 `caller = { type, keyId, scopes, userId? }` 挂到 request context。

> 与现有 `generateOpenApiSign` 的关系：那套是 `path?params+timestamp+secret` 的简化版。
> 本方案**不修改也别复用它**（它没有 nonce、不含方法、不含 body），而是在 `shared/service/cloud-function/`
> 下新增。两者并存是为了不动已上线的判题 webhook 契约；未来可把 webhook 迁到新实现。

### 6.3 密钥的存储：**派生而非保存**（推荐）

不保存明文、也不保存"加密后的密文"，而是让密钥可由「主密钥 + keyId」确定性派生：

```
secret = base64url( HMAC_SHA256( CF_MASTER_SECRET[v], keyId ) )
```

- 管理员在后台点"新建密钥"：生成随机 `keyId` → 服务端用上式算出 `secret` → **仅此一次**返回给前端。
- 数据库中只存 `keyId` 与 `masterVersion`，**没有任何 secret 字段**。
- 校验时用同样的式子重算，因为服务端持有主密钥。
- 轮换：`CF_MASTER_SECRETS` 支持多版本（`{"1":"...","2":"..."}`），新密钥写 `masterVersion=2`，
  旧密钥继续用 v1 校验；全部迁移后可移除 v1。**轮换主密钥不需要改任何已签发密钥的明文**。
- 撤销：删除/禁用行即可（派生是单向的，删了行就无法再验签）。

优点：数据库泄露不等于密钥泄露（攻击者还需要进程内存里的主密钥）；无需 KMS/加解密代码。
缺点：`CF_MASTER_SECRET` 是"万能钥匙"——它一旦泄露，可推导出所有外部密钥。因此它**只允许存在于
云函数服务进程**，绝不进 web-app（见下节内部密钥的例外）。

### 6.4 内部密钥：站点与判题的"自动认证"

内部密钥**不使用派生**，而是直接由环境变量在两处配对注入：

云函数服务：

```
CF_INTERNAL_KEYS={"web-app":"<32B random>","judge":"<32B random>"}
```

站点（web-app）：

```
CF_SERVER=http://challenge-cloud-function:1890
CF_INTERNAL_KEY_ID=web-app
CF_INTERNAL_SECRET=<与上面 web-app 的值完全一致>
```

判题环境（调度器 / 判题机容器）：

```
CF_SERVER=http://challenge-cloud-function:1890
CF_INTERNAL_KEY_ID=judge
CF_INTERNAL_SECRET=<与上面 judge 的值完全一致>
```

这样：

- **"自动认证" = 部署时配好即用**，不需要管理员在后台签发任何东西，也不需要数据库里有对应行。
- 内部密钥本质上是"另一种 API Key"，**走完全相同的签名校验路径**（§6.2 第 2 步的"命中内部密钥表"分支），
  不存在"跳过验签"的特权代码，避免出现两套鉴权逻辑。
- 内部密钥的 scope 由配置决定。v1 约定：
  - `web-app`：`invoke` + `read` + `manage`（因为管理后台就在 web-app 里代理）；
  - `judge`：仅 `invoke`；且**只能调用被显式加入 `CF_JUDGE_ALLOWED_FUNCTIONS` 的函数**
    （判题环境是最容易被题目/用户代码间接影响的地方，收窄它的权限）。
- **纵深防御（可选）**：云函数服务不在 compose 里映射 `ports`，只在内网 `quanta-challenge-network`
  可达；并可用 `CF_IP_ALLOWLIST` 再限制来源。签名是必须的，网络隔离只是加分项。
- 轮换：改两处环境变量 → 滚动重启。因为不落库，不存在遗留状态。

> **为什么站点不直接用派生主密钥？**
> web-app 是公网入口、攻击面最大。若把 `CF_MASTER_SECRET` 放进去，一旦 web-app 被攻破，
> 攻击者可伪造**任意**外部 API Key（包括别的管理员签发的）。用独立内部密钥，web-app 被攻破的
> 影响被限制在"它能用的那几个 scope"。

### 6.5 scope 语义

| scope | 允许的操作 |
|---|---|
| `invoke` | `POST /v1/invoke/:name`（受 `allowedFunctions` 进一步约束） |
| `read` | `GET /v1/functions*`、`GET /v1/keys`（不返回 secret） |
| `manage` | 函数增删改、发布、激活/回滚、密钥签发与撤销 |

scope 校验在 `middlewares/scope.ts` 统一完成，路由声明式标注所需 scope。

### 6.6 用户身份的可信来源

- `x-cf-user-id` **只信任"签名正确的内部调用方"**。外部 API Key 调用时该头被忽略（可只用于日志），
  防止外部集成伪造任意 `userId` 读写别人的隔离 KV。
- 需要一个"以系统身份调用、不针对具体用户"的能力时，内部调用方**不传** `x-cf-user-id`，
  此时用户隔离函数的 KV scope 退化为调用方 scope（`sys:<keyId>`）。若函数要求必须有用户，
  则由 `ctx.requireUser()` 抛错。

---

## 7. 云函数运行时契约

### 7.1 源码形态

一个函数就是一个模块，导出默认函数（也兼容具名 `handler` / 纯 `module.exports`）：

```ts
// 管理员在后台填写的 TS 源码
export default async function handler(ctx: CloudFunctionContext) {
  const { input, user, kv, log } = ctx;

  // 用户隔离开启时：key 自动带上当前用户前缀，互不可见
  const count = (await kv.get<number>('visits')) ?? 0;
  await kv.set('visits', count + 1, { ttlSeconds: 86400 });

  log.info({ count }, 'visit counted');
  return { total: count + 1, user: user?.name ?? 'anonymous' };
}
```

### 7.2 编译（发布期，不在调用期）

- 使用 **esbuild**（根 `package.json` 的 `onlyBuiltDependencies` 已包含它，仓库已有该依赖）：
  `bundle: true, format: 'cjs', platform: 'node', target: 'node20', write: false, minify: false,
  loader: { '.ts': 'ts' }`。
- **禁止内联依赖**：产物里出现 `require("<非白名单模块>")` 视为**编译失败**（在发布期就报错，
  不等到运行时）。v1 白名单为空——函数不得依赖任何外部模块。
- 产物与源码一起落库；运行时**只执行编译产物**，不在调用路径上编译（避免冷启动抖动）。
- `sourceHash` 相同则跳过新建版本，直接复用。

### 7.3 `ctx` API（v1）

```ts
interface CloudFunctionContext {
  /** 调用方传入的 JSON 输入，只读 */
  readonly input: unknown;

  /** 调用者身份；内部未传 userId 或匿名时为 null */
  readonly user: { id: string; name: string; role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' } | null;

  /** 受限 KV（见 §8） */
  readonly kv: CloudFunctionKV;

  /** 结构化日志，会带上 traceId / functionId，写入服务日志 */
  readonly log: {
    debug(msg: string, data?: Record<string, unknown>): void;
    info(msg: string, data?: Record<string, unknown>): void;
    warn(msg: string, data?: Record<string, unknown>): void;
    error(msg: string, data?: Record<string, unknown>): void;
  };

  /** 当前函数元信息（只读） */
  readonly fn: { name: string; version: number };

  /** 便捷方法：输入必须是对象且含该字段，否则抛 INVALID_INPUT */
  requireUser(): { id: string; name: string; role: string };
  requireInput<T>(schemaKeys: string[]): T;
}
```

**v1 刻意不提供**：`fetch` / `http` / `require` / `process` / `fs` / `setInterval` / `eval`
/ 访问环境变量 / 访问 Redis 原始命令。任何需要这些能力的需求，都应作为**新的受控 ctx 能力**
评审加入，而不是放开沙箱。

### 7.4 执行流程

```
invoke 请求
  → 验签 + scope + 防重放
  → registry.getActive(name)：L1 内存缓存 → 未命中查库（含 compiledCode）
  → 构造 KV 网关（绑定 functionId + scope + 限额）
  → executor.run({ code, ctxDescriptor })
      → 从 Worker 池取空闲 Worker（无空闲则排队，队列上限 CF_QUEUE_MAX）
      → 在 Worker 内新建 vm context，注入白名单全局 + RPC shim
      → 执行编译产物，等 promise
      → 主线程计时；超时 → worker.terminate()，返回 TIMEOUT
      → 结果经 JSON 序列化回传（上限 maxResponseBytes）
  → 写 CloudFunctionInvocation 日志（异步、失败不影响响应）
  → 返回 { ok: true, data, meta: { function, version, durationMs, traceId } }
```

### 7.5 错误响应

统一结构，便于 web-app 侧透传与前端展示：

```json
{ "ok": false, "error": { "code": "TIMEOUT", "message": "Function timed out after 5000ms", "traceId": "..." } }
```

错误码表：

| code | HTTP | 含义 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 签名缺失/错误/过期 |
| `FORBIDDEN` | 403 | scope 不足 / 函数不在 allowedFunctions |
| `REPLAY_DETECTED` | 409 | nonce 重复 |
| `FUNCTION_NOT_FOUND` | 404 | 函数不存在 |
| `FUNCTION_DISABLED` | 409 | 函数已停用 |
| `FUNCTION_NOT_PUBLISHED` | 409 | 无 activeVersion |
| `INVALID_INPUT` | 400 | 输入/参数不合法 |
| `TIMEOUT` | 504 | 执行超时 |
| `OOM` | 500 | 内存超限 |
| `RUNTIME_ERROR` | 500 | 函数抛错（message/stack 记日志，返回脱敏信息） |
| `KV_QUOTA_EXCEEDED` | 429 | KV 配额/限流 |

---

## 8. Redis 受限 KV 设计

### 8.1 Key 布局

```
cf:kv:<functionId>:<scope>:<key>
```

- `<scope>`：
  - 用户隔离开启：`u:<userId>`
  - 用户隔离关闭：`s`
  - 系统调用（无用户且函数要求无用户）：`sys:<keyId>`
- Redis Cluster 场景：把 `cf:kv:<functionId>:<scope>` 作为 hash tag `{...}` 包住，保证同一隔离域
  的多 key 操作落在同一 slot（v1 单机无所谓，属于前瞻设计）。
- **沙箱永远看不到这个完整字符串**：`kv` 对象接收的逻辑 key 由网关拼接。函数调用 `kv.get('visits')`，
  网关内部实际访问 `cf:kv:fn_123:u:user_abc:visits`。

### 8.2 用户自动隔离

- 隔离是**函数级开关**（`kvUserIsolated`），默认 **开**。
- 开启时：同一函数、不同 `userId` 天然互不可见；同名 key 不会互相覆盖。
- 关闭时：该函数所有调用者共享一份数据（适合"全站计数器""公共缓存"）。
  - 设计权衡：共享模式下，**任何能调用该函数的成员都能改这些数据**。因此后台在关闭隔离时
    必须有醒目提示，并且**建议共享模式的函数只对内网/特定 scope 的 key 开放**（后续可加
    `kvWriteRoles`）。
- 无用户的内部调用：不伪造 userId，落到 `sys:<keyId>` scope，绝不会混入某个真实用户的空间。

### 8.3 白名单操作（**唯一**能碰 Redis 的接口）

```ts
interface CloudFunctionKV {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ttlSeconds?: number }): Promise<void>;
  del(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  incr(key: string, by?: number): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<boolean>;
  ttl(key: string): Promise<number>;
  keys(pattern?: string): Promise<string[]>;      // 受上限约束的 SCAN
  mget<T = unknown>(keys: string[]): Promise<(T | null)[]>;
  mset(entries: { key: string; value: unknown; ttlSeconds?: number }[]): Promise<void>;
  clear(): Promise<number>;                        // 仅清理当前隔离域，需显式开启
}
```

**绝不暴露**：`EVAL`/`SCRIPT`、`FLUSHDB`/`FLUSHALL`、`CONFIG`、`KEYS *`（全库）、`SCAN` 无界、
`RENAME`、`MOVE`、`SELECT`、以及任何能跨越隔离域的操作。

值编码：统一 `JSON.stringify` 存储，读取时 `JSON.parse`。原始字符串可通过 `{ raw: true }` 选项
（v1 从简，只用 JSON）。

### 8.4 限制与配额

| 维度 | 默认值 | 环境变量 | 说明 |
|---|---|---|---|
| 逻辑 key 长度 | 256 字节 | `CF_KV_MAX_KEY_LEN` | 且须匹配 `^[A-Za-z0-9_\-.:/]+$`（禁止空格/控制字符/`*` 作为普通字符） |
| 单值大小 | 64 KiB | `CF_KV_MAX_VALUE_BYTES` | 超过直接拒绝 |
| TTL 上限 | 7 天 | `CF_KV_MAX_TTL_SECONDS` | `set` 未给 TTL 时默认 `CF_KV_DEFAULT_TTL`（1 天） |
| 单隔离域 key 数 | 1000 | `CF_KV_MAX_KEYS_PER_SCOPE` | 超限拒绝写入 |
| 单隔离域总字节 | 4 MiB | `CF_KV_MAX_BYTES_PER_SCOPE` | 超限拒绝写入 |
| `keys()` 返回上限 | 100 | `CF_KV_SCAN_LIMIT` | 用 `SCAN MATCH` + 上限截断；文档告知"不要依赖全量" |
| 单次调用 KV 操作数 | 200 | `CF_KV_MAX_OPS_PER_INVOKE` | 防抖式滥用 |
| 每函数+scope 限流 | 100 ops/s | `CF_KV_RATE_PER_SEC` | Redis 令牌桶，超限 `KV_QUOTA_EXCEEDED` |

配额计数：用一张小的 `__meta` hash 维护 `keys`（计数）与 `bytes`（总量），`set`/`del`/`incr`
通过 **Lua 脚本原子更新**，避免并发下计数漂移。`incr` 只改值但可能改变字节数，Lua 里按
"旧值长度 → 新值长度"修正 `bytes`。

### 8.5 key 越界防护（重点）

1. **拼接只在服务端**：`kv.get` 的入参只允许是"逻辑 key"，网关负责加前缀。
2. **pattern 校验**：`keys(pattern)` 中 pattern **不允许以 `/` 或 `:` 开头**（防止绕过前缀），
   且拼接后必须仍以 `cf:kv:<fn>:<scope>:` 开头——网关在拼接后做一次 `startsWith` 断言，
   任何不满足的输入直接抛 `INVALID_INPUT`（这一条是防御性冗余，即使前面的校验被绕过也能兜住）。
3. **禁止 `undefined`/`null` key**、禁止空字符串、禁止仅由 `.` 与 `/` 组成的 key。
4. 所有 KV 操作都在主线程（网关）里执行，**沙箱内只有 async RPC**，无法直接拿到 Redis 客户端。

### 8.6 为什么用 Redis 而不是复用现有缓存

- 现有 `redis.ts` 是 web-app 进程内的单例，**进程隔离**——云函数服务是另一个进程/容器，
  不能直接用同一对象；但可以、也应该连**同一个 Redis 实例**（`REDIS_HOST` 一致）。
- 通过 `cf:` 前缀与现有限流（`req_limit:`）、排行榜缓存等**完全隔离**，互不影响。
- 可选：用 `CF_REDIS_DB` 指定独立逻辑库（默认复用 db 0），进一步物理隔离。

---

## 9. HTTP API 规范

基础：`http://challenge-cloud-function:1890`，全部 JSON，全部（除 `/healthz`）需要签名。

### 9.1 调用

```
POST /v1/invoke/:name
scope: invoke
body: { "input": <any>, "options"?: { "timeoutMs"?: number } }
→ 200 { ok: true, data, meta: { function, version, durationMs, traceId } }
```

`timeoutMs` 只能**下调**本函数的超时，不能上调超过函数配置与 `CF_MAX_TIMEOUT_MS`。

### 9.2 函数管理（scope: manage / read）

| 方法 | 路径 | scope | 说明 |
|---|---|---|---|
| POST | `/v1/functions` | manage | 创建函数（name/description/kvUserIsolated/timeoutMs…） |
| GET | `/v1/functions` | read | 列表（分页、关键字） |
| GET | `/v1/functions/:name` | read | 详情（含当前版本摘要，不含 compiledCode） |
| PATCH | `/v1/functions/:name` | manage | 改元信息（描述/开关/超时/隔离开关） |
| DELETE | `/v1/functions/:name` | manage | 删除函数（软删或连带版本；默认软=禁用） |
| POST | `/v1/functions/:name/versions` | manage | 发布新版本 `{ source, activate?: boolean }` |
| GET | `/v1/functions/:name/versions` | read | 版本列表 |
| GET | `/v1/functions/:name/versions/:version` | read | 某版本（含源码，不含产物） |
| POST | `/v1/functions/:name/versions/:version/activate` | manage | 激活/回滚 |
| POST | `/v1/functions/:name/test` | manage | 试运行（用给定源码编译并执行一次，**不落库**） |

### 9.3 密钥管理（scope: manage）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/v1/keys` | 签发 `{ name, scopes, allowedFunctions?, expiresAt? }` → **返回一次明文 secret** |
| GET | `/v1/keys` | 列表（不含 secret） |
| PATCH | `/v1/keys/:keyId` | 启停 / 改 scope / 改有效期 |
| DELETE | `/v1/keys/:keyId` | 撤销 |

> 内部密钥（`web-app`/`judge`）**不在**这套 API 里，也不出现在 `GET /v1/keys` 结果中——
> 它们来自环境变量，属于"基础设施"，不是"业务密钥"。

### 9.4 健康检查

```
GET /healthz → { ok: true, redis: "ok", db: "ok", workers: { idle, busy, queued } }
```

参考现有服务的经验：**依赖没就绪时不能返回 ok**（见 `challenge-judge-scheduler` 的
"看似正常实际不可用"教训），因此 `/healthz` 会实际 ping Redis 与 Postgres。

---

## 10. 执行引擎（沙箱与调度）

### 10.1 隔离模型

- 每个调用在 **`worker_threads.Worker`** 中执行，创建时设置
  `resourceLimits: { maxOldGenerationSizeMb, maxYoungGenerationSizeMb, stackSizeMb }`。
  内存超限时 Worker 抛 `ERR_WORKER_OUT_OF_MEMORY` → 返回 `OOM`，**不会拖垮主进程**。
- Worker 内使用 **`node:vm.createContext`** 构造沙箱，只注入白名单全局：
  `JSON / Math / Date / TextEncoder / TextDecoder / URL / URLSearchParams / console(重定向到 ctx.log) /
  Promise / structuredClone` 等**纯计算**对象；不注入 `process / require / globalThis / fetch / setTimeout`。
- 每次调用**新建 vm context**，不复用，避免跨调用状态泄漏（全局变量污染）。
- Worker 在主线程侧有**健康计数**：执行 `CF_WORKER_RECYCLE`（默认 200）次后主动回收重建，
  防止长时间运行的 V8 堆碎片/残留。

### 10.2 资源控制

| 维度 | 默认 | 环境变量 |
|---|---|---|
| 单函数超时 | 5s（函数可配，硬上限） | `CF_MAX_TIMEOUT_MS=30000` |
| Worker 老生代内存 | 128 MB | `CF_WORKER_MEMORY_MB` |
| Worker 池大小 | `min(4, CPU 数)` | `CF_WORKER_POOL_SIZE` |
| 等待队列上限 | 256 | `CF_QUEUE_MAX` |
| 单函数并发上限 | 16 | `CF_MAX_CONCURRENCY_PER_FUNCTION` |
| 响应体上限 | 256 KiB | `CF_MAX_RESPONSE_BYTES` |

超时实现：主线程 `setTimeout` → `worker.terminate()`（terminate 是强制的，能中断死循环）。
队列满时立刻返回 `429 FUNCTION_BUSY`，不无限堆积。

### 10.3 编译产物执行方式

Worker 拿到的是**单文件 CJS 字符串**。在 vm context 里伪造模块环境：

```ts
const module = { exports: {} as any };
const sandbox = { module, exports: module.exports, ...whitelistedGlobals, __ctx };
vm.createContext(sandbox);
new vm.Script(compiledCode, { filename: `${fnName}@${version}.js` }).runInContext(sandbox);
const handler = module.exports.default ?? module.exports.handler ?? module.exports;
const result = await handler(__ctx);
```

`require` **不注入**；若产物中残留 `require(...)`，运行时报 `ReferenceError: require is not defined`
——但正常路径下编译期已经拒绝（§7.2）。

### 10.4 KV 的跨线程 RPC

沙箱内的 `ctx.kv.get(...)` 本质是一次 RPC：

```
沙箱 (vm)  →  worker 层 __kvCall(op, args)  →  parentPort.postMessage   →  主线程网关(§8)
                                                      ▲                        │
                                                      └──── response ──────────┘
```

- 主线程维护 `Map<requestId, resolve>` 做请求-响应配对。
- 主线程在响应前完成 **key 拼接、校验、配额、限流**——沙箱无法绕过。
- Worker 被 terminate 时，挂起的 RPC 全部 reject；主线程清理 Map，避免泄漏。

---

## 11. web-app 集成

### 11.1 出站客户端

```ts
// server/utils/cloud-function-client.ts
export async function callCloudFunction<T>(opts: {
  name: string;
  input: unknown;
  userId?: string;          // 由服务端会话注入，绝不来自前端
  traceId?: string;
}): Promise<T> { /* 组装签名头 → fetch → 统一错误 → 抛 TRPCError */ }
```

- 密钥从 `useRuntimeConfig().cloudFunction` 读取（由环境变量注入）→ **自动认证**。
- 所有调用都带 `x-trace-id`，与现有链路追踪串起来。

### 11.2 runtimeConfig 增补

```ts
cloudFunction: {
  serverUrl: env('CF_SERVER', 'http://localhost:1890'),
  keyId:     env('CF_INTERNAL_KEY_ID', 'web-app'),
  secret:    env('CF_INTERNAL_SECRET', ''),
},
```

`server/plugins/validate-secrets.ts` 里对生产环境的 `CF_INTERNAL_SECRET` 做非空校验
（沿用现有"生产环境拒绝静默降级"的做法）。

### 11.3 tRPC 路由

成员调用（`server/trpc/routes/protected/cloud-function.ts`）：

```ts
invoke: protectedProcedure
  .input(z.object({ name: z.string(), input: z.unknown() }))
  .mutation(({ ctx, input }) =>
    callCloudFunction({ name: input.name, input: input.input, userId: ctx.user.userId }));
```

管理入口（`server/trpc/routes/admin/cloud-function.ts`，`protectedAdminProcedure`）：

- `list` / `get` / `create` / `update` / `remove`
- `publishVersion` / `listVersions` / `activateVersion` / `testRun`
- `listKeys` / `createKey` / `updateKey` / `revokeKey`（`createKey` 的明文 secret 只在响应里出现一次）

前端页面建议：函数列表 + 在线编辑器（复用现有 Monaco） + KV 隔离开关 + 版本历史 + 试运行面板。

---

## 12. 判题环境集成

判题侧调用云函数的典型场景：判题完成后按业务规则动态加成就分 / 发通知 / 记录自定义统计。

- 调度器 `result-handler.ts` 目前已有"回调 web-app webhook"的逻辑；云函数调用是**并列的第二条出口**。
- 判题容器（`judge-machine`）与调度器都在 `quanta-challenge-network`，可直接
  `http://challenge-cloud-function:1890`。
- 使用 `CF_INTERNAL_KEY_ID=judge` + `CF_INTERNAL_SECRET`，scope 仅 `invoke`，
  且只允许调用 `CF_JUDGE_ALLOWED_FUNCTIONS` 白名单里的函数。
- 判题调用**不带 `x-cf-user-id`**（或带被判题用户的 id，视函数设计），
  由函数的 `kvUserIsolated` 与 `ctx.requireUser()` 决定行为。
  - 建议：判题侧调用若需要"针对某个用户的统计"，显式传该用户的 id，并在云函数服务端校验
    "内部调用方 judge 允许代设 userId"（内部密钥的可信级别高于外部 key）。

### 12.1 为什么不经过 web-app 中转

判题链路本就直连多个服务；再经 web-app 会：增加一跳延迟、让 web-app 成为判题的强依赖
（判题机历史上是单点，不希望再扩大故障面）。因此判题**直连**云函数服务，用内部密钥自动认证。

---

## 13. 部署与配置

### 13.1 docker-compose 增补

```yaml
  challenge-cloud-function:
    build:
      context: ../
      dockerfile: packages/challenge-cloud-function/Dockerfile
    environment:
      - NODE_ENV=production
      - PORT=1890
      - DATABASE_URL=postgres://quanta:quanta@postgres:5432/quanta_db
      - REDIS_HOST=redis
      # 内部密钥（与 web-app / 判题调度器一一对应，值必须完全一致）
      - CF_INTERNAL_KEYS=${CF_INTERNAL_KEYS:?请设置 CF_INTERNAL_KEYS}
      # 外部 API Key 的派生主密钥
      - CF_MASTER_SECRETS=${CF_MASTER_SECRETS:?请设置 CF_MASTER_SECRETS}
      # 判题侧白名单
      - CF_JUDGE_ALLOWED_FUNCTIONS=${CF_JUDGE_ALLOWED_FUNCTIONS:-}
    depends_on:
      - redis
      - postgres
    networks:
      - quanta-challenge-network
    # 注意：这里刻意不写 `ports:` —— 云函数服务只在内网可达，不暴露到宿主机
```

web-app 服务下增加 `CF_SERVER` / `CF_INTERNAL_KEY_ID` / `CF_INTERNAL_SECRET`；
判题调度器同样增加这三个（`CF_INTERNAL_KEY_ID=judge`）。

### 13.2 环境变量总表

| 变量 | 服务 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `PORT` | cloud-function | 否 | 1890 | 监听端口 |
| `DATABASE_URL` | cloud-function | 是 | — | Postgres |
| `REDIS_HOST` / `REDIS_PORT` | cloud-function | 是 | — | 复用现有 Redis |
| `CF_INTERNAL_KEYS` | cloud-function | 是 | — | JSON：`{"web-app":"…","judge":"…"}` |
| `CF_MASTER_SECRETS` | cloud-function | 是 | — | JSON：`{"1":"…","2":"…"}` |
| `CF_JUDGE_ALLOWED_FUNCTIONS` | cloud-function | 否 | 空=不允许 | 判题可调函数白名单（逗号分隔） |
| `CF_SIGN_WINDOW_MS` | cloud-function | 否 | 300000 | 签名时间窗 |
| `CF_WORKER_POOL_SIZE` | cloud-function | 否 | min(4,CPU) | Worker 池 |
| `CF_WORKER_MEMORY_MB` | cloud-function | 否 | 128 | 单 Worker 内存上限 |
| `CF_MAX_TIMEOUT_MS` | cloud-function | 否 | 30000 | 超时硬上限 |
| `CF_KV_*` | cloud-function | 否 | 见 §8.4 | KV 各限额 |
| `CF_SERVER` | web-app / 判题 | 是 | — | 云函数服务地址 |
| `CF_INTERNAL_KEY_ID` | web-app / 判题 | 是 | — | `web-app` / `judge` |
| `CF_INTERNAL_SECRET` | web-app / 判题 | 是 | — | 与 `CF_INTERNAL_KEYS` 对应值一致 |

> 生产环境缺失 `CF_INTERNAL_SECRET` / 主密钥时**启动即失败**，不允许静默降级
> （复用 `server/plugins/validate-secrets.ts` 与 `config.ts` 的显式校验思路）。

### 13.3 本地开发

- `docker start quanta-challenge-postgres-1 quanta-challenge-redis-1`
- 根 `.env` supplement 一段 `CF_*` 开发值（dev 下允许内置兜底，生产不允许）。
- `cd packages/challenge-cloud-function && pnpm dev`（vite dev server，:1890）
- web-app / 调度器各自的 `.env` 配 `CF_SERVER=http://localhost:1890` 与开发内部密钥。

---

## 14. 可观测性与运维

- **结构化日志**：每次调用记录 `traceId / functionId / version / callerKeyId / userId / durationMs /
  status / errorCode / inputBytes / outputBytes`。日志用现有 `pino` 风格。
- **调用记录表**：`cloud_function_invocations`，由定时任务清理（保留 `CF_INVOCATION_RETENTION_DAYS`，
  默认 14 天）。参考 web-app 已有的 Nitro scheduled task 用法。
- **指标**（v1 先落日志 + 简单聚合接口）：
  - 调用量 / 成功率 / P50/P95 延迟（按函数）
  - 超时率、OOM 次数、队列深度
  - KV 操作量、配额命中次数
- **缓存失效**：`registry` 的 L1 缓存以 `(functionId, activeVersionId)` 为 key。
  发布/激活时，通过 Redis **Pub/Sub** 广播一个失效消息（channel `cf:registry:invalidate`），
  多实例同时失效；单实例部署时可退化为主进程内事件。这样避免"多副本时有的实例还在跑旧版本"。

---

## 15. 安全与威胁模型

| 威胁 | 缓解措施 |
|---|---|
| 伪造调用方 | HMAC 签名 + timing-safe 比较；keyId 解析 secret 后才验签 |
| 重放请求 | 时间窗 + nonce `SET NX` 去重 |
| 外部 key 冒充用户 | `x-cf-user-id` 仅对内部签名调用方生效 |
| 一个用户读别人的 KV | 默认用户隔离；key 前缀由服务端拼接且拼接后有 `startsWith` 断言 |
| 一个函数读别的函数 KV | functionId 固定在 key 前缀里 |
| 死循环 / 内存炸弹 | Worker 隔离 + 硬超时 + `resourceLimits` |
| 沙箱逃逸执行任意命令 | 不注入 `require/process/fetch`；**威胁模型假设代码来自管理员**；若开放成员发布则必须换 `isolated-vm`/进程隔离（见 §3.4、§18） |
| 配额刷爆 Redis | per-scope key/bytes 配额 + per-second 限流 + 单调用 op 上限 |
| 敏感信息落日志 | 响应脱敏；API Key 明文只在签发时出现一次，不落库、不落日志 |
| 主密钥泄露影响面 | 主密钥只在云函数服务进程；被攻破的 web-app 无法伪造其它 key |
| 网络暴露 | 云函数服务不映射宿主机端口，仅内网可达；可选 `CF_IP_ALLOWLIST` |

**明确记录的安全债**（必须写进文档，避免被误解为"绝对安全"）：

1. `node:vm` **不是**安全边界，`worker_threads` 也不是。v1 的隔离强度仅匹配"管理员可信代码"。
2. `vm2`（仓库现有 vm2 用法）已停止维护，本方案**不采用** vm2。
3. 未来若要做"成员自助发布"，必须升级到 `isolated-vm` 或"每次调用一个一次性容器"，并重新评审。

---

## 16. 测试计划

- **单元测试（vitest，与 web-app 一致）**
  - 签名生成/校验：正常、时间窗过期、nonce 重放、body 篡改、userId 篡改、错误 keyId。
  - 密钥派生：同一 `(master, keyId)` 稳定；不同 keyId 不同；轮换版本正确。
  - KV 网关：key 长度/字符集/TTL 上限/值大小/配额/越界 pattern/`startsWith` 断言。
  - 编译器：TS→CJS；含 `require('x')` 的源码在编译期被拒。
- **集成测试**
  - 端到端：创建→发布→调用→返回。
  - 用户隔离：用户 A 写的 key，用户 B 读不到。
  - 关闭隔离：两用户共享（并验证确实是设计行为）。
  - 超时：死循环函数 5s 返回 `TIMEOUT`，服务仍健康。
  - OOM：大数组分配返回 `OOM`，主进程不受影响。
  - 并发：超过单函数并发上限时返回 `FUNCTION_BUSY` 而非堆积。
- **端到端冒烟**：纳入 `packages/challenge-web-app/scripts/smoke-test.mjs`，
  增加"云函数：发布→调用→KV 隔离"一项，保证 CI/本地一键可验。
- **负向验证**（参考仓库 `QUALITY_BASELINE.md` 的做法）：故意注入一个"读越界 KV key"的调用，
  断言被拒绝；故意发一个重放请求，断言 409。

---

## 17. 实施路线图

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P0 骨架** | 建包、Hono 服务、签名中间件、`/healthz`、共享 sign 模块 | 签名单测通过；健康检查反映真实依赖 |
| **P1 核心** | registry + compiler + executor（worker/vm）+ KV 网关 + `/v1/invoke` + 内部密钥 | 内部密钥可自动认证；用户隔离端到端通过 |
| **P2 管理** | Prisma 模型/迁移 + 函数 & 版本 & 密钥管理 API | 管理员可从 API 发布/回滚/签发密钥 |
| **P3 站点** | web-app tRPC（成员调用 + 管理）+ 管理页面 | 成员在页面上能调用；管理员在后台能发布 |
| **P4 判题** | 调度器/判题机接入 + 白名单 | 判题完成后可调用云函数，权限被白名单收窄 |
| **P5 运维** | 调用日志清理任务、Pub/Sub 缓存失效、限流配额、指标 | 多实例版本一致；配额可观测 |

每个阶段都应更新 `.agent/QUALITY_BASELINE.md`，把"云函数"纳入 typecheck / smoke 覆盖范围。

---

## 18. 开放问题（待评审拍板）

1. **KV 隔离开关的授权**：`kvUserIsolated=false` 意味着成员可互写数据，
   是否需要额外的"仅管理员可关闭 / 需二次确认"策略？
2. **外部 API Key 的用途**：v1 主要服务内部；是否现在就开放给第三方集成（如外部活动系统）？
   如需，是否要按 key 绑定"可调用函数白名单"以外的更细粒度（如 input schema）？
3. **是否提供 `ctx.fetch`**：若未来需要，应做成"域名白名单 + 出网审计"，而不是直接放开。
4. **函数间调用**：云函数能否调用另一个云函数？若允许需防环与递归配额。
5. **可观测后端**：调用记录是否需要接入现有日志/指标体系，还是先只落 Postgres + 日志文件。
6. **沙箱升级时机**：一旦有"成员发布"的需求，是否立刻切 `isolated-vm`（原生依赖，构建更重）
   还是走"一次性容器"路线。
7. **版本激活策略**：v1 是"手动激活"，是否要灰度（按 userId 百分比激活新版本）？

---

## 附录 A：一次完整调用的示例（成员 → tRPC → 云函数）

```
1. 前端：trpc.protected.cloudFunction.invoke({ name: 'daily-bonus', input: { problemId: 42 } })
2. web-app context 从 cookie 解析 userId = "u_1"，注入签名：
   canonical = "POST\n/v1/invoke/daily-bonus\n\n<sha256(body)>\n1730000000000\n<n>\nu_1"
   signature = HMAC_SHA256(CF_INTERNAL_SECRET, canonical)
3. POST /v1/invoke/daily-bonus
   x-cf-key-id: web-app, x-cf-user-id: u_1, x-cf-signature: …
4. 云函数服务验签 → 加载 daily-bonus@v3 → 执行 handler(ctx)
5. handler 内 kv.get('last:42')
     → RPC → 网关拼 cf:kv:fn_daily:u:u_1:last:42 → Redis GET
6. 返回值 { bonus: 10 }
7. web-app 收到 → tRPC 返回 → 页面展示；云函数服务异步写调用日志
```

## 附录 B：`ctx` 与 KV 的边界（速查）

```
沙箱内可见          沙箱内不可见
─────────────       ────────────────────────────────
input                process / require / fetch
user (可信来源)       Redis 客户端 / 原始命令
kv (RPC 代理)         cf:kv: 完整 key
log                  CF_* 环境变量 / 主密钥
fn (name/version)    文件系统 / 网络 / 其它函数的数据
```

---

*文档结束。评审通过后，先落 P0/P1，再决定 P2+ 的排期。*
