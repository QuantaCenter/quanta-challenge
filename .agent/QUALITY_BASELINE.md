# 质量基线（Quality Baseline）

本文件记录当前仓库的**可验证基线**，供实习生与后续维护者快速判断"环境是否正常"。
每条都附有可复现的命令与预期结果。

---

## 环境自检

本仓库已移除全部自动化测试（单测 / e2e / 冒烟脚本均不再包含在版本库中）。
判断环境是否正常以 `pnpm typecheck`、各包构建产物与运行时日志为准。

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
| `challenge-cloud-function` | `tsc --noEmit` | 全部 | 0 错误 |
| `database`、`shared`、`live-server` | **未接入** | — | 无独立 tsconfig |

### 云函数系统（challenge-cloud-function）

```powershell
cd packages/challenge-cloud-function
pnpm typecheck          # tsc：0 错误（前置：pnpm --filter @challenge/database prisma:generate）
pnpm build              # 产物含 dist/index.js 与 dist/runtime/worker.js 两个入口
```

两步都已在 CI 里跑：`.github/workflows/cloud-function.yml`（仅在本包/`prisma`/`shared/service/cloud-function`
变化时触发），断言两个入口产物存在。

本地开发模式（HTTP 由 `@hono/vite-dev-server` 提供，:1890）另行验证可启动并响应 `/healthz`。

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
**这类问题只能靠运行时日志（或手工端到端验证）发现**。

---

## 代码注释基线

代码注释只写**功能与必要的接口约束**，不写推导过程、踩坑经历、权衡理由与调试结论 ——
那些属于 commit message 或 `docs/`。注释是给改动者看的说明书：写进注释的推导会随代码漂移，
最后变成误导信息。

规则：

1. 一行能说清就一行；块注释 / JSDoc 最多 4 行（含 `/**` 与 `*/`），签名已表达的类型不重复写进 `@param`。
2. 常量、字段注释只写含义与单位，例：`/** 超时上限（毫秒）。 */`。
3. 禁用叙事词：`实测`、`曾经`、`第一次`、`踩坑`、`白跑`、`于是`、`免得`、`一坨`；
   `因为`、`所以`、`否则` 只出现在规则 4 的约束句里。
4. 例外必须写：不写就会再次踩坑的**隐式约束**，一句话说完。
   例：`// 必须在任何 await 之前挂载，否则调用方随后触发的请求会漏统计。`

自检（可复现）：

```bash
BASE=dev

# 1. 最长连续新增注释行数（预期 ≤ 4；当前基线：4）
git diff -U0 $BASE...HEAD -- '*.ts' '*.vue' | awk '
  /^[+][+][+]/ { next }
  /^[+]/ { if ($0 ~ "^[+][[:space:]]*(//|/[*]|[*])") { run++; if (run > max) max = run } else run = 0; next }
  { run = 0 }
  END { printf "最长连续新增注释：%d 行（预期 ≤ 4）\n", max }
'

# 2. 叙事词（预期无输出）
git diff -U0 $BASE...HEAD -- '*.ts' '*.vue' | grep -E '^[+]' | grep -v '^[+][+][+]' \
  | grep -E '实测|曾经|第一次|踩坑|白跑|于是|免得|一坨' || echo '未命中叙事词'
```

`docs/**`、`README.md` 与 commit message 不受本规则约束：面向用户的用法与取舍说明本来就该写清理由。

**负向验证**：合成补丁里放 7 行连续块注释，第 1 条报 `7 行`；放 `// 实测下来这样最快`，
第 2 条命中并输出该行。

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

依赖（PostgreSQL / Redis）起不来时，Web 能打开但接口全报错、判题一直 pending，
所以**先确认依赖，再起服务**：

```bash
docker start quanta-challenge-postgres-1 quanta-challenge-redis-1   # 已设 restart=unless-stopped，通常自动恢复

cd packages/challenge-judge-scheduler ; pnpm dev   # 判题调度器，端口 1888（不启动它，qpc upload 会 500）
cd packages/challenge-web-app        ; pnpm dev:watch
```

> 原先仓库里有一对 `scripts/start-dev.bat` / `stop-dev.bat`，是 Windows + Docker Desktop
> 专用的编排脚本（`taskkill`、`Docker Desktop.exe` 路径、`netstat` 端口清理）。
> 在 macOS / Linux 上一步都跑不动，且 CI 与容器部署都不用它，已删除；
> 上面的命令就是它的等价手工流程。

---

## 踩过的坑

事故档案在 [`docs/PITFALLS.md`](../docs/PITFALLS.md)：每条写明「症状 → 根因 → 记住什么」，
按「前端状态与本地存储 / 编号与地址 / 数据源切换 / 判题与 CLI / 产品口径」分类。
改这一块之前先扫一眼对应分类，能省掉几轮返工。

## 已知问题

| 问题 | 影响 | 说明 |
|---|---|---|
| `stackblitz.com` 间歇性不可达 | 在线编辑器可能无法启动 | 外部依赖，非代码问题；WebContainer 必须访问它 |
| 提交链路强耦合 WebContainer | 容器起不来则无法提交 | 构建/快照/上传都在浏览器容器内完成 |
| `vm2` 已停止维护 | 沙箱安全性 | 判题脚本由管理员控制，风险可接受；根治需换 `isolated-vm` 或独立进程 |
| 调度器挂载 `docker.sock` | 等同宿主机 root 权限 | 架构性，部署时需限制网络可达性 |
| 判题机单点 | 该容器故障则全平台无法判题 | 目前 1 个容器、1 个 Playwright 实例 |
