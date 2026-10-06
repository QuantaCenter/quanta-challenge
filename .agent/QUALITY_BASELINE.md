# 质量基线（Quality Baseline）

本文件记录当前仓库的**可验证基线**，供实习生与后续维护者快速判断"环境是否正常"。
每条都附有可复现的命令与预期结果。

---

## 一键自检（优先跑这个）

```powershell
cd packages/challenge-web-app
pnpm smoke
```

依次验证：Docker 依赖容器 → 应用端口 → 判题机容器 → 跨源隔离响应头 → 端到端判题 → 外部网络。
**任何一项失败都会直接给出修复命令。**

预期（正常时）：

```
[1/6] Docker 依赖容器        ✅ Docker 守护进程 / PostgreSQL / Redis / 连接可用
[2/6] 应用服务端口            ✅ Web :3000 / 调度器 :1888
[3/6] 判题机容器              ✅ 运行中
[4/6] 跨源隔离                ✅ COOP=same-origin COEP=require-corp
[5/6] 端到端判题              ✅ result=success
[6/6] 运行环境                ✅ stackblitz.com 可达
```

> 第 6 项是**外部域名可达性**，可能间歇性失败（实测时而 1.2s 通、时而 20s 超时）。
> 它只影响**在线编辑器的实时预览**，不影响登录、题库与判题。

---

## 类型检查

```powershell
pnpm typecheck            # 仓库根：检查全部 3 个有配置的包
cd packages/challenge-web-app
pnpm typecheck:server     # 只跑 server 侧（tsc）
pnpm typecheck:app        # 只跑 app 侧（vue-tsc）
```

当前基线：**0 错误**。

覆盖范围与已知边界：

| 包 | 命令 | 覆盖 | 状态 |
|---|---|---|---|
| `challenge-web-app`（server） | `tsc -p tsconfig.typecheck.server.json` | `server/**` + `lib/{logger,prisma,track-wrapper}.ts` | 0 错误 |
| `challenge-web-app`（app） | `vue-tsc -p tsconfig.typecheck.app.json` | `app/**`、`*.vue` | 0 错误 |
| `challenge-judge-scheduler` | `tsc --noEmit` | 全部 | 0 错误 |
| `challenge-agents/judge-machine` | `tsc --noEmit` | 全部 | 0 错误 |
| `database`、`shared`、`live-server` | **未接入** | — | 无独立 tsconfig |

### ⚠️ 不要在 dev server 运行时跑 typecheck
`nuxt prepare`（typecheck 的第一步）会重写 `.nuxt/`，而 dev server 正持有其中的文件。
两者并发会导致 dev server 报 ENOENT 并可能 **JavaScript heap out of memory**。
先停 dev server，或至少等它空闲时再跑。

### app 侧为什么需要 vue-tsc
`app/**` 依赖 Vue 的自动导入（`ref` / `computed` / `defineStore`）与 SFC 语法，
纯 `tsc` 无法解析 `.vue` 文件，也会把响应式类型判错。

### 两个作用域为什么必须对齐编译选项
app 作用域默认比 server 更严（`noUncheckedIndexedAccess`、
`verbatimModuleSyntax` 为 `true`），而 app 通过 `AppRouter` 类型**间接引用了全部 server 代码**。
若不收窄，同一份 server 代码在两处会得出矛盾结论 —— 实测 **app 侧 61 个错 vs server 侧 0 个错**。
对齐后降到 9 个（都是 app 自己的真实问题），修完即 0。
server 的严格检查由 `tsconfig.typecheck.server.json` 负责，不在 app 侧重复。

### ⚠️ exclude 是「整体替换」而非追加
`tsconfig.typecheck.app.json` 一旦写 `exclude`，父级 `.nuxt/tsconfig.app.json` 里
那条关键的 **`../server`** 就会丢失，server 文件重新进入检查范围（实测报错从 9 涨到 61）。
修改 exclude 时必须对照父配置确认没有漏掉 `../server`。

### 这个门槛是有效的（已做负向验证）
- server 侧：在 `lib/logger.ts` 注入两处常见错误 → 退出码 2，准确报出
  `TS2769: No overload matches this call` 与 `TS2339: Property 'log' does not exist`
- app 侧：在 `challenge-layout.vue` 注入类型错误 → 退出码 2，报出
  `TS2322: Type 'string' is not assignable to type 'number'`

还原后均回到 0 错误。

### 已知局限：类型检查抓不到「包类型与运行时不符」
`OffScreenTwo` 那次 500 就是例子 —— `@icon-park/vue-next` 的 **类型定义声明了该导出**
（`es/map.d.ts:1696`），但**运行时并没有真正导出**，于是 SSR 渲染 undefined 组件而 500。
类型检查全绿，因为类型定义本身就是错的。
**这类问题只能靠端到端冒烟测试或运行时日志发现** —— 这正是 `pnpm smoke` 存在的理由。

---

## 开发服务器崩溃自愈

```powershell
cd packages/challenge-web-app
pnpm dev:watch      # 推荐：进程退出后自动重启
pnpm dev            # 原生 nuxt dev（需要看原始行为时用）
```

`dev:watch` 会在 `nuxt dev` 异常退出后 1.5 秒自动拉起（已实测）。

---

## 启动顺序

```
1. 确认 Docker Desktop 正在运行
2. start-dev.bat（依赖起不来会明确报错退出，不会"假装成功"）
```

手工方式：

```powershell
docker start quanta-challenge-postgres-1 quanta-challenge-redis-1   # 已设 restart=unless-stopped，通常自动恢复
cd packages/challenge-judge-scheduler ; pnpm dev
cd packages/challenge-web-app        ; pnpm dev:watch
```

---

## 已知问题

| 问题 | 影响 | 说明 |
|---|---|---|
| `stackblitz.com` 间歇性不可达 | 在线编辑器可能无法启动 | 外部依赖，非代码问题；WebContainer 必须访问它 |
| 提交链路强耦合 WebContainer | 容器起不来则无法提交 | 构建/快照/上传都在浏览器容器内完成 |
| `vm2` 已停止维护 | 沙箱安全性 | 判题脚本由管理员控制，风险可接受；根治需换 `isolated-vm` 或独立进程 |
| 调度器挂载 `docker.sock` | 等同宿主机 root 权限 | 架构性，部署时需限制网络可达性 |
| 判题机单点 | 该容器故障则全平台无法判题 | 目前 1 个容器、1 个 Playwright 实例 |
