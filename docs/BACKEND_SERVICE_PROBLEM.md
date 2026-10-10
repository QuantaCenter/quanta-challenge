# 后端服务题型（Backend Service Problem）

前端的题目把「用户代码」当成**静态站点**：快照挂进 `challenge-live-server-agent`
（`live-server`），判题机用 Playwright 打开页面跑 DOM 断言。

后端服务题型是另一条链路：用户代码是一个**会常驻监听的进程**（HTTP API / RPC / Worker）。
判题机不用浏览器，而是**向这个进程发请求**，再用一套新的脚本 API 断言响应。

本文档定义这条链路：新增哪些镜像、哪些服务、调度器怎么串起来，以及每一步的
边界与失败模式。实现落在以下位置：

| 关注点 | 位置 |
|---|---|
| 题型字段 | `packages/database/prisma/schema.prisma` |
| 后端服务容器镜像 | `packages/challenge-agents/backend-service/` |
| 后端判题机镜像 / 服务 | `packages/challenge-agents/backend-judge-machine/` |
| 调度器编排 | `packages/challenge-judge-scheduler/src/services/docker.ts`、`src/mq/judge-processor/` |
| 出题工具链 | `packages/problem-creator-cli/`、`packages/challenge-web-app/server/trpc/` |

> 本文是**设计 + 落地说明**，不是空想。凡是踩过的坑都会标出来，和 `PNPM_CACHE.md`
> 一样的写法：先讲结论，再讲为什么。

---

## 1. 一句话总结

```
快照 ──▶ 恢复临时目录
         │
         ▼
     ① 热更新缓存（POST /cache/update / PnpmCacheService.update）
         │  用【题目镜像】起一次性容器，联网跑 pnpm install，把包灌进共享 store
         ▼
     ② 启动后端服务容器（challenge-backend-service-agent）
         │  只读挂载 store + NetworkMode 保持在内网 + 容器内 `pnpm install --offline`
         │  然后执行题目自定义启动命令，端口可连后打印 `Ready`
         ▼
     ③ 后端判题机（challenge-backend-judge-machine-agent）
           通过 WebSocket 收到 { baseUrl, judgeScript }，在 VM2 里跑新脚本 API，
           对 baseUrl 发请求、断言，用 JRTP 回结果
```

与前端题型**唯一共享**的是：调度器、BullMQ 队列、JudgeRecords / 结果落库、
Web 回调。其余（容器、判题机、脚本 API）都是新的。

---

## 2. 为什么不能复用前端链路

| 环节 | 前端题型 | 后端服务题型 |
|---|---|---|
| 用户产物 | 静态文件 | 常驻进程 |
| 容器 | `challenge-live-server-agent`（`live-server`） | `challenge-backend-service-agent` |
| 依赖 | 无需安装（或 WebContainer 侧装好） | 启动前必须 `pnpm install` |
| 判题机 | Playwright + DOM | HTTP 客户端 + 新脚本 API |
| 就绪信号 | `live-server` 打印 `Ready` | 由容器入口脚本探测端口后打印 `Ready` |
| 网络 | 判题机访问 `http://<alias>:3000` | 同左，但容器自身要**断网安装** |

结论：**不能把后端服务塞进 live-server 容器**。硬塞会得到两种坏结果：
要么带着网络安装（可复现性崩掉），要么没有网络也没 store（安装直接失败）。

---

## 3. 数据模型

`problems` 新增（见 migration `*_add_backend_service_problem`）：

```prisma
enum ProblemType {
  frontend          // 默认，现有全部题目
  backend_service
}

model Problems {
  // ...existing
  problemType  ProblemType @default(frontend)
  /// 后端服务跑在哪个镜像里；空则用调度器默认值 challenge-backend-service-agent
  serviceImage String?
  /// 服务监听端口，也是判题机请求的端口
  servicePort  Int         @default(3000)
}
```

设计取舍：

1. **默认 `frontend`**：老数据不需要回填，`migrate deploy` 直接幂等通过。
2. **启动命令复用 `bootCommand`**：前端里它叫「启动命令」，后端里语义完全一致
   （`pnpm start` / `node dist/index.js`），没必要再造一个字段。
3. **安装命令不落库**：离线安装是**镜像的职责**（入口脚本固定写死
   `pnpm install --offline --frozen-lockfile --store-dir /pnpm-store`）。
   允许题目自定义安装命令 = 允许绕过 offline 保证，直接从设计上禁掉。
4. **镜像按题目可配**：题目作者可以选择 `node:24-slim`、`python:3.12-slim` 等
   「比较基础」的镜像，只要它按 §4 的约定提供入口脚本。空值走默认镜像。

---

## 4. 后端服务容器镜像：`challenge-backend-service-agent`

位置：`packages/challenge-agents/backend-service/`。

### 4.1 它做什么

入口脚本 `/usr/local/bin/quanta-entrypoint.sh` 的职责，按顺序：

1. 进入题目目录（默认 `/app/project`，由 `QUANTA_APP_DIR` 覆盖）。
2. **离线安装**：若存在 `pnpm-lock.yaml` 则跑
   `pnpm install --offline --frozen-lockfile --store-dir /pnpm-store`。
3. 启动服务：执行题目自定义的 `QUANTA_START_COMMAND`。
4. 探测 `QUANTA_PORT` 可连后打印 `Ready`（调度器靠这行判断就绪）。
5. `wait` 住前台进程。

### 4.2 为什么用基础镜像 + 入口脚本

题目作者要求「有些比较基础的镜像」——`node:24-slim` 就够跑典型的
Express / Fastify / Nest 服务。我们**不**在镜像里塞业务框架，只塞：

- `pnpm@9.15.9`（必须与 store 大版本一致，见 `PNPM_CACHE.md`）
- 入口脚本
- `curl`/`ca-certificates` 等最小运行时依赖

这样镜像体积小、构建快，也能作为「默认题目镜像」长期复用。

### 4.3 就绪探测必须由脚本做，不能靠服务自己

`live-server` 自带 `Ready` 输出，但用户的服务（`node dist/index.js`）不会。
如果直接 `exec` 用户命令，调度器收不到 `Ready`，只能等到超时。
所以入口脚本必须自己探测端口后再 `echo Ready`，且探测要有上限（默认 60s），
超时打印错误并以非 0 退出，让容器快速失败而不是挂死。

---

## 5. 后端判题机：`challenge-backend-judge-machine-agent`

位置：`packages/challenge-agents/backend-judge-machine/`。

### 5.1 与前端判题机的关系

- **相同**：Hono + `@hono/node-ws` 起 `:3000`，`/link` 升级 WebSocket；
  用同一套 **JRTP** 协议回包；结果 schema 形状一致（`results[]` + `totalScore`），
  因此调度器的 `processResult` / 落库 / 回调**一行都不用改**。
- **不同**：沙箱里暴露的不是 `page`，而是 `http`（HTTP 客户端）与扩展的 `$`。

### 5.2 新脚本 API

```js
export default defineTestHandler(async ({ http, $ }) => {
   $.defineCheckPoint('GET /health 返回 ok', 10, async () => {
      const res = await http.get('/health');
      $.expect(res.status === 200, `期望 200，实际 ${res.status}`);
      $.expect(res.json.ok === true, 'body.ok 应为 true');
      return 10;
   });
});
```

`http` 的能力面（刻意收窄）：

| 方法 | 说明 |
|---|---|
| `http.get(path, options?)` | `path` 相对 `baseUrl`，也接受绝对 URL（受白名单约束） |
| `http.post/put/patch/delete(path, body?, options?)` | `body` 为对象时自动 `JSON.stringify` + `content-type` |
| 返回 | `{ status, headers, text, json, buffer }` |

安全边界：

- **URL 白名单**：只允许 `baseUrl` 的同源地址（默认）。否则判题脚本能拿判题机当跳板。
- **超时**：单请求默认 10s，总脚本预算 20s（小于调度器 30s，避免静默挂起）。
- **响应体上限**：默认 2MB，防止大响应把判题机内存打满。
- **VM2 沙箱**：与前端判题机一致，脚本不能 `require` / `import`。

### 5.3 不做 Playwright / 不装浏览器

镜像基于 `node:24-slim`，不拉 Chromium，体积与启动时间都远小于前端判题机
（前端镜像要装 Playwright + 浏览器依赖，构建慢且大）。

---

## 6. 调度器编排

### 6.1 题型判定

调度器**不信任任务创建方传进来的题型**，而是按 `judgeRecordId` 反查数据库：

```ts
const runtime = await db.getProblemRuntimeInfo(problemId);
// { problemType, serviceImage, servicePort, bootCommand, judgeUploadPath }
```

这样前端 / CLI / 未来的入口只要保证 DB 里的题目配置正确即可，
不会出现「传了 `problemType=frontend` 但题目其实是后端」的错配。

### 6.2 后端任务处理流程（`judge-processor`）

```
1. 恢复 fsSnapshot → 临时目录
2. 预热缓存：PnpmCacheService.update({ source:'external', project, image })
   —— 这就是"调用特定 API 热更新缓存库"；HTTP 侧入口是 POST /cache/update
3. 启动后端服务容器：
   · bind: 临时目录 → /app            （读写）
   · bind: 共享 store → /pnpm-store   （【只读】）
   · 网络别名 = fsName，入 orange-network
   · env: QUANTA_START_COMMAND / QUANTA_PORT / QUANTA_APP_DIR
   · 等容器打印 Ready（超时 90s，比前端的 10s 长：含离线安装）
4. 确保后端判题机已启动（懒加载），拿到它的 WebSocket
5. 发任务 { judgeRecordId, judgeScript, mode, baseUrl }
6. 等 JRTP 结果（超时 30s，与前端一致）
7. 复用 processResult 落库 + 关闭容器
```

### 6.3 为什么后端判题机懒加载

前端判题机在 `initServices()` 里启动，缺失镜像会直接让调度器起不来——
这是**有意为之**（旧环境忘构建镜像时快速暴露）。但后端判题机的镜像只在
「有后端题目」的环境里才需要构建。如果也放进 `init()`，所有现存部署都会因为
一个用不到的镜像而启动失败。

因此：**首次遇到后端任务时再启动**，用 `ensureBackendJudgeMachine()` 做单例守卫；
镜像不存在时只有这一次后端判题失败，不影响前端判题。

### 6.4 缓存预热来源

`source` 默认 `external`（公网 registry）。私有化部署可用 `internal` 指向
本地 registry（`PNPM_CACHE_INTERNAL_REGISTRY`）。预热的镜像**必须**等于
题目容器镜像，否则 postinstall 产物（openssl/arch 相关）会在消费端 miss，
`PnpmCacheService` 的 digest 校验会在门禁阶段直接拒绝。

---

## 7. 失败模式与对策

| 症状 | 根因 | 对策 |
|---|---|---|
| 容器一直不 Ready | 离线安装缺包（缓存没预热到） | 预热失败要显式报错；入口脚本打印 pnpm 日志尾巴 |
| `pnpm install` 联网 | 忘了 `--offline` 或用了 `--prefer-offline` | 安装在镜像入口脚本里写死，题目无法覆盖 |
| 判题机连不上服务 | 网络别名 / 端口不对 | 与前端同一套别名机制；`baseUrl` 由调度器拼 |
| 缓存过期（镜像换了） | digest 变了 | `PnpmCacheService.verify` 的 digest 校验；预热后写 meta |
| 后端判题机镜像没构建 | 首次后端任务 | 懒加载 + 明确错误信息（提示 `pnpm docker:build`） |
| 脚本 SSRF | 脚本请求任意地址 | 同源白名单 + 响应体上限 |

---

## 8. 出题侧

- **CLI**：`problem.config.ts` 增加 `type: 'backend_service'` 与
  `runtime.serviceImage / servicePort / startCommand`。
  预检规则相应增加：后端题目必须提供 `pnpm-lock.yaml`（否则离线安装无从谈起）、
  必须声明 `servicePort`、`judgeUploadPath` 下的目录必须是可运行服务。
- **Web 发布页**：题型选择器 + 后端专属字段；前端字段（首屏封面）对后端题目隐藏。
- **审计**：后端题目同样走 `mode:'audit'`，只是判题机换成后端那个；
  参考答案满分 = 服务能起来且脚本全过。

---

## 9. 已知限制（本实现有意没做的部分）

1. **自定义 `serviceImage` 不会被清扫器回收**：`sweepStaleLiveServers` 只按
   `PROBLEM_CONTAINER_IMAGES`（默认镜像集合）枚举。自定义镜像的泄漏容器只能靠
   `close()` / `AutoRemove` 兜底。题目使用自定义镜像时请关注磁盘。
2. **门禁（`POST /cache/verify`）未接入判题热路径**：每次判题都跑一次试装容器
   代价过高；预热 + 容器内 `--offline` 已经 fail-closed。门禁保留为出题/发布前的
   手动预检入口。
3. **编辑器预览仍是前端的**：后端服务题目的在线「运行 / 预览」尚未实现，
   当前只保证「提交判题」可用。
4. **CLI 尚未提供后端脚手架**：`qpc init` 仍生成前端骨架；后端题目需要手写
   `problem.config.ts`（`qpc check` 会按 RUN002 / RUN003 / IMG002 校验）。

---

## 10. 落地清单（本仓库实现顺序）

1. `schema.prisma` + migration：`ProblemType` + `problemType/serviceImage/servicePort`。
2. `packages/challenge-agents/backend-service/`：Dockerfile + 入口脚本。
3. `packages/challenge-agents/backend-judge-machine/`：新判题机（Hono + VM2 + http API）。
4. 调度器：`docker.ts` 新增后端容器 / 判题机生命周期；`judge-processor` 分流；
   `db.getProblemRuntimeInfo`。
5. CLI / Web：题型与运行时配置。
6. 文档：本文 + 更新 `README.md` 的镜像构建步骤。

> 1–4 是「能判一道后端题」的最小闭环；5 是出题体验；6 是给下一个人少踩坑。
