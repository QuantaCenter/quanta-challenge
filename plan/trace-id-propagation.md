# Trace ID 全链路贯穿与日志上报改造方案

> 目标：让 trace ID 从浏览器请求开始，贯穿 web-app → cloud-function → judge-scheduler 全链路，并在所有服务日志中以协议顶层字段 `trace_id` 上报，可在 Grafana/Loki 中按 trace 聚合检索。
>
> 依据：`docs/LOG_REPORTING_PROTOCOL.md`（日志上报协议）与 2026-10-18 全仓库排查结论。

---

## 1. 现状问题（排查结论）

### 1.1 链路贯穿现状

| 链路段 | 现状 | 问题 |
|---|---|---|
| 浏览器 → web-app（tRPC） | ✅ `app/plugins/trpc.ts` 每请求带 `x-trace-id`（genUUID） | 非 tRPC 请求（oauth/refresh/webhook 直访）无 trace，落到 `'unknown'` |
| web-app → cloud-function | ✅ `callCloudFunctionService` 支持 `traceId` 透传 | 无 |
| cloud-function 内部 | ✅ `traceMiddleware` 接收/生成，贯穿调用记录与错误响应 | ❌ `executor.ts` 的 `ExecutionJob.traceId` 收了但从未使用（不绑子 logger、不传 Worker） |
| web-app → judge-scheduler | ❌ BullMQ `/task/create` payload 无 traceId 字段 | 调度器整条链路（queue / judge-processor / result-handler / docker）零 trace 概念 |
| judge-scheduler → web-app（webhook 回调） | ❌ `requestWebhook` 不带 `x-trace-id` 头 | web-app `judge-complete` 收到的 traceId 恒为 `'unknown'` |
| tRPC context | ⚠️ | `context.ts` CSRF 校验失败分支提前 `return { event }`，丢弃已带来的 traceId |

### 1.2 日志上报现状

| 服务 | logger | trace 上报 |
|---|---|---|
| cloud-function | 已接 `@challenge/shared/logger`（buildLogger） | ❌ 未用 `logger.child({ trace_id })`，逐条手写 `traceId`（camelCase），被 `toProtocolObject` 归入 `attributes.traceId`，不在协议顶层 `trace_id` 字段，Grafana 按协议字段检索不到 |
| judge-scheduler | 已接 buildLogger | ❌ 所有日志无 trace 字段，仅 `quanta.judge.record_id` 可间接关联 |
| web-app | ❌ `lib/logger.ts` 未接 buildLogger | ❌ 生产环境也固定 pino-pretty，违反协议 §7.2；traceId 靠 20+ 处手动传参；`middlewares/log.ts` 错误分支展开 `...ctx` 会把 H3 event 序列化进日志 |

### 1.3 格式问题

- web-app：`genUUID()` → 36 位带连字符；
- cloud-function：`randomBytes(8).toString('hex')` → 16 位 hex；
- 协议要求：W3C Trace Context 32 位 hex（`LOG_REPORTING_PROTOCOL.md` §3/§7）。

---

## 2. 设计总览

### 2.1 目标链路

```
浏览器 ──x-trace-id──▶ web-app (Nitro middleware 统一取/生成)
                         │
                         ├─ tRPC / api：AsyncLocalStorage 绑定，logger mixin 自动注入 trace_id
                         │
                         ├─▶ cloud-function：x-trace-id 透传（已有），executor 绑定子 logger
                         │      └─▶ 沙箱 Worker：traceId 传入，console 代理日志带 trace
                         │
                         └─▶ judge-scheduler：
                                POST /task/create { ..., traceId }
                                  └─▶ job.data.traceId
                                        └─▶ judge-processor / result-handler：logger.child({ trace_id })
                                              └─▶ webhook 回调带 x-trace-id 头 → web-app judge-complete
                                                    └─▶（回环闭合，同一条业务 trace）
```

### 2.2 核心设计决策

| 决策 | 方案 | 理由 |
|---|---|---|
| traceId 格式 | W3C 32 位 hex（`crypto.randomBytes(16).toString('hex')`） | 协议 §3 要求；为未来对接 OTel tracing 铺路 |
| 生成与收敛 | `@challenge/shared` 新增 `createTraceId()`，各处替换 | 消除 genUUID / 16-hex 两种私有实现 |
| web-app 上下文传递 | Nitro middleware（`server/middleware/trace.ts`）+ `AsyncLocalStorage` | 一次注入全请求生效，消灭 20+ 处手动传参；非 tRPC 路由同步覆盖 |
| 日志注入方式 | pino `mixin` 读取 ALS | child logger 无法覆盖 async 边界外的场景（BullMQ 回调等），mixin 天然全局；shared buildLogger 增加可选 `traceContext` 钩子 |
| judge-scheduler 传递 | HTTP 入参 → `job.data.traceId` → ALS/mixin | BullMQ job 是天然边界，随 payload 走最可靠 |
| webhook 回传 | `requestWebhook` 增加 `x-trace-id` 头（沿用 job.data.traceId） | 回环闭合；web-app 端已有读取逻辑，无需改 |
| 错误响应 | cloud-function 错误体 `traceId` 字段保留（对外排障入口） | 改名成本低收益小；内部日志统一用 `trace_id` |

### 2.4 用户身份随链路上报

不采集设备指纹（稳定性差、有合规风险、与 trace 诉求不匹配），改为**携带已认证的用户信息**：协议 §6.2 已定义 `quanta.user.id` / `quanta.user.role` 字段，本次将其纳入 ALS 上下文，随 trace 自动注入所有日志。

**设计**

1. **ALS store 改为可变上下文对象**：`{ traceId: string, userId?: string, role?: string }`。middleware 创建 store 时只有 traceId；各服务在**认证完成后**向同一 store 引用补写 `userId/role`（ALS 取出的是引用，直接赋值即可，无需重开作用域）——这解决了"认证发生在 middleware 之后"的时序问题；
2. **shared mixin 泛化**：`getTraceId` 改为 `getRequestContext`，同时输出顶层 `trace_id` 与 attributes 的 `quanta.user.id` / `quanta.user.role`；未登录请求只带 `trace_id`；
3. **各服务注入点**：
   - web-app：tRPC `createContext` 解析 JWT 成功后写入；非 tRPC 路由在各自的 auth 校验处写入（oauth/refresh 等已有 `verifyToken` 的地方）；
   - cloud-function：`signatureMiddleware` 解析出 `caller` 后写入（`caller.userId` 已有）；
   - judge-scheduler：判题 payload 携带 `userId`（入队时从请求方传入；老 job 兜底为空），processor 写入 store；
4. **合规边界**：只上报内部标识（userId、role 枚举），**不上报**用户名/邮箱/昵称等 PII；userId 已是现有日志的常见字段（`judge-complete` 等），无新增敏感面。

**与 trace 的关系**：`trace_id` 仍是链路主键；`quanta.user.id` 是并列的业务属性，解决"同一用户跨请求聚合检索"的诉求（这正是指纹想解决但解决不好的部分）。

**`packages/shared/utils/logger.ts`**：

1. 新增 `createTraceId(): string`（16 bytes hex）；
2. `BuildLoggerOptions` 增加 `getRequestContext?: () => { traceId: string; userId?: string; role?: string } | undefined`；
3. pino 增加 `mixin`：上下文存在时返回 `{ trace_id, attributes: { 'quanta.user.id': ..., 'quanta.user.role': ... } }`（顶层 `trace_id` 复用现有 `TOP_LEVEL_KEYS` 通道，注意 mixin 与 formatters.log 的合并顺序需验证——若 formatters.log 不接收 mixin 键则改在 `toProtocolObject` 白名单放行 `trace_id`）。

> ⚠️ 实现时先写单测验证 pino `mixin` × `formatters.log` 的执行顺序，避免 trace_id 被误收进 attributes。

---

## 3. 分阶段实施

### Phase 1：shared 基础设施

**涉及文件**

- `packages/shared/utils/logger.ts`：`createTraceId` + `getTraceId` mixin
- `packages/shared/utils/trace.ts`（新增）：请求上下文 `AsyncLocalStorage` 封装（`runWithRequestContext(store, fn)` / `getRequestContext()`，store 含 `traceId/userId/role` 且为可变引用），供 web-app 与 judge-scheduler 复用
- `packages/shared` 单测：mixin 注入与字段顺序、trace id 格式（32 hex 正则）、认证后补写 userId 生效

**验收**：`buildLogger({ serviceName, getTraceId })` 产出的 JSON 中 `trace_id` 位于顶层。

### Phase 2：cloud-function 补全

**涉及文件**

- `src/utils/ids.ts`：`createTraceId` 改为 32-hex 或直接改 import from shared（删除本地实现）
- `src/utils/logger.ts`：buildLogger 挂 `getTraceId: () => als.getStore()?.traceId`
- `src/services/trace.ts`（新增）：ALS 实例；`traceMiddleware` 里 `als.run({ traceId }, () => next())`
- `src/middlewares/index.ts`：`signatureMiddleware` 解析出 `caller` 后补写 `userId` 进 ALS store（§2.4）
- `src/services/executor.ts`：执行期间 `als.run` 包裹；Worker 出口日志（invocations 记录已有 traceId，保留）与 executor 内部日志自动带 trace_id
- `src/controllers/index.ts` / `invoke.ts`：删除手动 `traceId:` 传参（mixin 已覆盖）

**验收**：一次 invoke 产生的所有 JSON 日志行 `trace_id` 一致，且等于响应体里返回的 `traceId`。

### Phase 3：web-app 改造（工作量最大）

**涉及文件**

- `lib/logger.ts`：替换为 `buildLogger({ serviceName: 'challenge-web-app' })`（生产 JSON / 开发 pretty），修复生产美化输出问题
- `server/middleware/trace.ts`（新增 Nitro 全局中间件）：
  - 取 `x-trace-id`（校验 32-hex，非法则重新生成）→ `als.run` 包裹 `event` 生命周期 → `setHeader(event, 'x-trace-id', traceId)`（响应头回传，便于前端排障）
- `server/trpc/context.ts`：删除手读 header 逻辑（middleware 已覆盖）；修复 CSRF 失败分支丢 trace 的问题（改用 ALS 取）；JWT 解析成功后向 ALS store 补写 `userId` / `role`（§2.4）
- 非 tRPC 路由的 auth 校验处（oauth device / refresh / webhook）解析 token 成功后同样补写 userId
- `server/trpc/middlewares/log.ts`：
  - 删除手动 `traceId: ctx.traceId`
  - 错误分支 `...ctx` 改为显式 `{ ip, duration, error, path }`，不再序列化 H3 event
- `server/utils/cloud-function-client.ts`：`traceId` 改为默认从 ALS 取，`options.traceId` 保留覆盖能力
- 手写 `traceId` 的路由清理（约 6 处）：`oauth/device/*.ts`、`refresh.get.ts`、`webhooks/judge-complete.get.ts`、`api/cloud-function/[name].ts`
- `app/plugins/trpc.ts`：`genUUID()` → `createTraceId()`（32-hex）

**风险点**：Nuxt Nitro 的 `setHeader` 与 tRPC 响应头合并；SSR 内部 `$fetch` 自调用是否会双重经过 middleware（需在 dev 环境验证，若重入则以最外层为准）。

**验收**：生产模式下任一 tRPC / api 日志行含顶层 `trace_id`；响应头 `x-trace-id` 与日志一致；CSRF 失败日志也有 trace。

### Phase 4：judge-scheduler 补链路

**涉及文件**

- `src/schemas/create-task.ts`：schema 增加可选 `traceId`（校验 32-hex，缺失时服务端生成）与 `userId` 字段；调用 `/task/create` 的入队方同步携带 userId
- `src/mq/judge-processor/index.ts`：processor 入口补写 `userId` 进 ALS store（§2.4，老 job 兜底为空）
- `src/controllers/task.ts`：入队时 `job.data.traceId`；ALS 包裹请求处理
- `src/utils/logger.ts`：buildLogger 挂 `getTraceId`
- `src/mq/judge-processor/index.ts`：processor 入口用 `als.run(job.data.traceId, ...)` 包裹整个判题流程（覆盖 docker、timing、db 全部子调用日志）
- `src/mq/result-handler.ts`：回调处理包裹 ALS；`requestWebhook` fetch 增加 `headers: { 'x-trace-id': job.data.traceId }`
- `src/services/queue.ts`：worker `completed/failed` 事件日志确认被 ALS 覆盖（事件回调脱离 processor 上下文，需在 emit 处带 traceId 或在 handler 里 `als.run`）

**风险点**：`EventEmitterService` 异步监听器脱离 ALS 上下文——`TASK_COMPLETED` payload 里已带 `job`，handler 内用 `als.run(job.data.traceId, ...)` 重入即可。

**验收**：一次判题从 `/task/create` 到 webhook 回调，web-app 侧 `judge-complete` 日志的 `trace_id` 与调度器全链路日志一致；Grafana 中可用一个 trace 串起「提交 → 排队 → 判题 → 回调 → 成就」。

### Phase 5：收尾

- 全仓库 `grep 'traceId'` 清理残留手动传参（对外 API 的 `traceId` 响应字段除外）；
- `docs/LOG_REPORTING_PROTOCOL.md` §7 更新：记录 ALS + mixin 方案与 32-hex 落地情况；
- observation 采集配置验证：`trace_id` 作为结构化字段可检索（`packages/challenge-observation` 的 Loki/Grafana dashboards 增加按 trace_id 查询的示例面板，可选）。

---

## 4. 兼容性与灰度

1. **对外接口不变**：cloud-function 错误响应的 `traceId` 字段、webhook 参数全部保留；
2. **traceId 兼容旧格式**：middleware 对传入的旧格式（UUID、16-hex）先透传不校验（Phase 3 期间），全部服务发版后再开启 32-hex 强校验；
3. **web-app 的 SSR 内部调用**：`$fetch` 自调用若重复生成 trace 会断链，Phase 3 验证时重点检查 `/api/refresh` 等被 SSR 调用的路由；
4. **老 job 兼容**：发版瞬间队列中已存在的 judge job 无 `traceId` 字段，processor 需兜底生成。

---

## 5. 验收清单（整体）

- [ ] 浏览器发起一次判题提交，一个 `trace_id` 串起：web-app tRPC 日志 → 调度器判题日志 → 容器/网络操作日志 → webhook 回调日志 → 成就判定日志；
- [ ] 生产环境所有服务日志均为协议 JSON Lines，`trace_id` 在顶层；
- [ ] 登录用户的请求日志同时携带 `quanta.user.id` / `quanta.user.role`，未登录请求仅 `trace_id`，全链路不出现用户名/邮箱等 PII；
- [ ] Grafana 可按 `trace_id` 过滤日志（observation 面板验证）；
- [ ] cloud-function invoke 响应中的 `traceId` 与该请求所有日志行一致；
- [ ] 判题 worker 异常路径（TASK_FAILED / TASK_ERROR）日志同样带 trace；
- [ ] 单测覆盖：trace id 格式、mixin 注入、ALS 跨 await 保持、BullMQ 回调重入。
