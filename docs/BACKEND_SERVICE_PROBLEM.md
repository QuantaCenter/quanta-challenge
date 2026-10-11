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
         │  然后执行题目自定义启动命令（initCommand），端口可连后打印 `Ready`
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
  /// 初始镜像 id（**不是** docker 镜像名），取值见 @challenge/shared/backend-service-image
  serviceImage String?
  /// 服务监听端口，也是判题机请求的端口
  servicePort  Int         @default(3000)
}
```

> 早期 `serviceImage` 存的是自由填写的镜像名（例如 `challenge-backend-service-agent`），
> 现在是注册表里的稳定 id（`node-24`）。**这是一次破坏性变更**：解析只认注册表 id。
> 迁移见 `*_normalize_backend_service_image`（命令列不动，历史值仍然有效）。

设计取舍：

1. **默认 `frontend`**：老数据不需要回填，`migrate deploy` 直接幂等通过。
2. **启动命令复用 `initCommand`**：它与编辑器里「长期运行的 dev server」是同一条命令，
   因此**编辑器与判题容器共用它**，作者只写一遍。`bootCommand` 只放**一次性的安装/构建**
   步骤（编辑器会等它退出，所以不能放常驻进程；判题容器不用它，因为入口脚本自己做离线安装）。
   详见 §11。
   **后端题的 `bootCommand` 不由作者写**（由初始镜像决定，§3.5）；`initCommand` 仍可自定义，
   镜像只提供默认值。
3. **安装命令不落库**：离线安装是**镜像的职责**（入口脚本固定写死
   `pnpm install --offline --frozen-lockfile --store-dir /pnpm-store`）。
   允许题目自定义安装命令 = 允许绕过 offline 保证，直接从设计上禁掉。
4. **镜像按题目可配，但只能从注册表里选**：不再是自由填写的镜像名，
   而是下拉选项（当前只有 `node-24`）。原因见下一节。

### 3.5 初始镜像注册表（为什么把命令锁在代码里）

单一事实来源：`packages/shared/service/backend-service-image.ts`。每条目携带
`label / image / editorBootCommand / initCommand / defaultPort`，
Web 发布页、CLI 与调度器三端共用同一份。

为什么不能让出题人自由填「镜像名 + 命令」：后端题的运行链路上有三段命令
（编辑器的一次性准备、容器内的离线安装、服务启动），它们必须和镜像里的运行时约定
严格一致。让两者各自自由填写，就会出现「镜像里装的是 pnpm store，题目却写
npm install」这类错配——症状是容器永远不 Ready，而不是一个显式报错。

因此：

| 位置 | 行为 |
|---|---|
| 注册表 | 镜像 → 命令的默认值（新增语言 = 加一个条目 + 一个 Dockerfile） |
| Web 发布页 | 镜像为下拉选项；`bootCommand` 只读，`initCommand` 按镜像回填默认值但**可自定义** |
| 服务端（`resolveBackendServiceRuntime`） | 落库前覆盖 `bootCommand`；`initCommand` 用请求里的值 |
| CLI | `runtime.serviceImage` 是枚举；`bootCommand` 会被覆盖（RUN002 提示），`initCommand` 自定义则保留 |
| 调度器 | 按 id 解析镜像名（**只认注册表 id**，未知/空值一律回退默认镜像）；执行库里的 `initCommand`，为空时回退镜像默认值 |

为什么只有 `bootCommand` 必须锁：它在容器里有**对应物**——入口脚本自己会跑一次
`pnpm install --offline ...`，编辑器里这一步必须与之一致。而 `initCommand` 在容器里没有
对应的“标准做法”，容器只是 `sh -c "$QUANTA_START_COMMAND"`，我们传什么就跑什么，
把它锁住只会挡住合法的自定义需求（入口文件、参数、端口都因题而异）。

调度器的题目容器清扫名单（`PROBLEM_CONTAINER_IMAGES`）也从注册表派生，
因此题目能用的镜像必然在回收范围内，不会泄漏容器。

Node 镜像的 `initCommand` 默认值是 `cd ./<挂载目录> && npm start`：入口建议写在工程自己的
`package.json` 的 `scripts.start` 里（随代码版本走、离线可用、编辑器与容器都能跑）。
`package.json` 没有 `scripts.start` 时 npm 会回退到 `node server.js`，
因此老的 `cd ./project && node server.js` 题目无需改代码。

**新增一个运行时（例如 Python）的完整流程**：

1. 在 `packages/challenge-agents/` 下加一个镜像：必须提供兼容的入口脚本
   （环境变量契约见 §4.1，就绪信号固定 `[quanta] Ready`）。
2. `docker/docker-compose.yaml` 里加构建条目。
3. `packages/shared/service/backend-service-image.ts` 加注册表条目
   （id / 展示名带版本号 / 镜像名 / 两条命令 / 默认端口）。
4. 三端自动生效（发布页下拉、CLI 校验、调度器清扫列表都从注册表派生）。
5. 更新本文档与 `docs/PROBLEM_AUTHORING.md`。

---

## 4. 后端服务容器镜像：`challenge-backend-service-agent`

位置：`packages/challenge-agents/backend-service/`。

### 4.1 它做什么

入口脚本 `/usr/local/bin/quanta-entrypoint.sh` 的职责，按顺序：

1. 进入题目目录（默认 `/app/project`，由 `QUANTA_APP_DIR` 覆盖）。
2. **离线安装**：若存在 `pnpm-lock.yaml` 则跑
   `pnpm install --offline --frozen-lockfile --store-dir $QUANTA_STORE_DIR`。
3. **切到工作目录**（默认 `/app`，由 `QUANTA_WORK_DIR` 覆盖）——注意不是 `APP_DIR`，
   因为启动命令与编辑器共用，写的是相对挂载根的 `cd ./project && ...`。
4. 启动服务：执行 `QUANTA_START_COMMAND`（由调度器按注册表命令注入）。
5. 探测 `QUANTA_PORT` 可连后打印 `Ready`（调度器靠这行判断就绪）。
6. `wait` 住前台进程。

这就是「新镜像必须满足的契约」，完整环境变量：

| 变量 | 作用 |
|---|---|
| `QUANTA_APP_DIR` | 装依赖的目录（快照里的题目目录） |
| `QUANTA_WORK_DIR` | 执行启动命令的工作目录（快照挂载根） |
| `QUANTA_STORE_DIR` | 只读共享 pnpm store 的挂载点 |
| `QUANTA_START_COMMAND` | 启动命令（镜像注册表规定） |
| `QUANTA_PORT` | 服务监听端口，也是就绪探测与判题机请求的端口 |
| `QUANTA_READY_TIMEOUT` | 就绪探测上限（默认 60s） |

就绪信号固定为 `[quanta] Ready`（调度器按字符串匹配，不要改格式）。

### 4.2 为什么用基础镜像 + 入口脚本

`node:24-slim` 就够跑典型的 Express / Fastify / Nest 服务，因此镜像里**不**塞业务框架，只塞：

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
// { problemType, serviceImage, servicePort, initCommand, judgeUploadPath }
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
   · env: QUANTA_START_COMMAND / QUANTA_PORT / QUANTA_APP_DIR / QUANTA_WORK_DIR
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

- **CLI**：`problem.config.ts` 里写 `type: 'backend_service'` 与
  `runtime.serviceImage（枚举，当前只有 node-24）/ servicePort / initCommand`。
  `runtime.bootCommand` 会被镜像覆盖（`RUN002` 以 warn 提示）。
  预检规则：后端题目必须提供 `pnpm-lock.yaml`（RUN003，否则离线安装无从谈起）、
  不能用默认封面（IMG002）、`judgeUploadPath` 下的目录必须是可运行服务。
- **Web 发布页**：题型选择器；选后端后出现「初始镜像」下拉（Node 24）+「服务端口」，
  `bootCommand` 变只读（展示镜像规定的那一条），`initCommand` 按镜像回填默认值但可改；
  首屏封面字段与「是否使用云函数」对后端题目隐藏（服务端也会把 `enableCloudFunction` 置为 false）。
- **判题脚本编辑器**：模板与类型声明都按题型切（前端 `page` / 后端 `http`）。
  两份声明文件独立：`public/system.frontend.standalone.dts` 与
  `public/system.backend.standalone.dts`（不能合并——`addExtraLib` 是全局累积的，
  同名接口会合并成“既有 page 又有 http”）。切题型时会 dispose 旧的再换新的。
- **审计**：后端题目同样走 `mode:'audit'`，只是判题机换成后端那个；
  参考答案满分 = 服务能起来且脚本全过。

---

## 9. 已知限制（本实现有意没做的部分）

1. **后端题不支持云函数**：云函数令牌是做题页签发、学生手动粘贴、2 小时过期的；
   判题容器里既不签发也不注入令牌，答案一旦依赖云函数，就是「审核能过、学生提交随机失败」。
   因此发布页隐藏这个开关，服务端也会把后端题的 `enableCloudFunction` 置为 false。
2. **门禁（`POST /cache/verify`）未接入判题热路径**：每次判题都跑一次试装容器
   代价过高；预热 + 容器内 `--offline` 已经 fail-closed。门禁保留为出题/发布前的
   手动预检入口。
3. **编辑器预览是「能跑但没有画面」**：`initCommand` 会在 WebContainer 里把服务跑起来
   （所以学生能用终端调自己的 API），但预览面板对纯 HTTP 服务无内容可展示——
   题目应该把「怎么自己 curl 验证」写进题面。
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
7. 初始镜像注册表：`packages/shared/service/backend-service-image.ts` +
   发布页下拉 + 服务端收敛（`resolveBackendServiceRuntime`）+ CLI 枚举 +
   调度器清扫列表派生 + 数据迁移与历史题目回填脚本。

> 1–4 是「能判一道后端题」的最小闭环；5 是出题体验；6 是给下一个人少踩坑。

---

## 11. 命令字段语义（最容易搞反的地方）

同一个题目有三个命令字段，编辑器与判题容器对它们的用法**不同**：

| 字段 | 编辑器（WebContainer） | 判题容器 | 要求 |
|---|---|---|---|
| `bootCommand` | 逐个执行，**等它退出** | **不用**（入口脚本自己做离线安装） | 只能放有限步骤 |
| `initCommand` | 只取**第一行**，写进交互式 `sh` | **就是服务启动命令** | 长期运行的服务器 |
| `buildCommand` | 点「提交」时执行一次并等它退出 | 不用 | 必须能自行退出；无构建时用 `node -e ""` |

> 后端服务题型的 `bootCommand` **不由作者填写**（来自初始镜像注册表，§3.5）；
> `initCommand` 仍由作者决定，发布页按镜像回填默认值。前端题型两个字段都完全自由。

两个必须遵守的约定：

1. **`initCommand` 必须相对挂载根写 `cd ./project && ...`**。
   - 编辑器里 WebContainer 根下有个 `project/` 目录（`toProjectMountPath` 统一加前缀）；
   - 判题容器把快照挂在 `/app`，入口脚本先在 `APP_DIR`(`/app/project`) 装依赖，
     再切到 `WORK_DIR`(`/app`) 执行启动命令。
   两边都有 `project/` 这层，所以同一条命令两边都能跑。
2. **提交快照会剔除 `node_modules` 等噪音**（`CommitModal.vue` 的 `SNAPSHOT_IGNORE`）。
   否则编辑器里的 `pnpm install` 会把整棵依赖树（含**平台相关二进制**）打进去，
   既容易超过 5MB 上传上限，也会污染判题容器。

> 后端题的 `bootCommand` 用 `pnpm --dir ./<挂载目录> install` 而不是 `cd X && pnpm install`：
> 编辑器是 `spawn(cmd, args)` 直接执行（没有 shell），“`cd`”是内建命令，`&&` 也不会被解释。
> `initCommand` 不同，它是写进交互式 `sh` 的，所以可以写 `cd X && ...`。

参考配置（本仓库 `#165·待办事项 HTTP API` 实际在用）：

```ts
type: 'backend_service',
runtime: {
   judgeUploadPath: 'project',
   bootCommand: '[install] pnpm --dir ./project install',
   initCommand: '[dev-server] cd ./project && node server.js',
   buildCommand: 'node -e ""',   // 无构建步骤，仅为让提交入口不空转
   servicePort: 3000,
},
```

> 编辑器的 `CommitModal` 有一道 `if (!buildCommand || !uploadDir) return` 的守卫：
> **`buildCommand` 为空时点提交会静默什么都不发生**。后端题目同样要填一个立即退出的
> `buildCommand`（`node -e ""`），与现有题目 #162 的写法一致。
