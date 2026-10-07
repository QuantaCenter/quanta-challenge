# @challenge/problem-creator-cli（`qpc`）

把 `docs/PROBLEM_AUTHORING.md` 里"照流程走十分钟"的出题流程做成一条命令链：
**脚手架 → 离线预检 → 上传 → 等审计 → 发布**。

它存在的理由很简单：出题踩的坑几乎全是"隐式约定"（检查点必须 return 分数、
快照键必须带 `/project/` 前缀、`initCommand` 必须指向打包目录……）。
约定要么写进文档、要么在代码里强制校验——本工具选了后者。

## 快速开始

```bash
# 在仓库根目录安装依赖后即可使用（workspace 内已链接）
pnpm --filter @challenge/problem-creator-cli build

# 方式一：从仓库根调用（相对路径按仓库根解析）
pnpm qpc --help

# 方式二：在包内直跑源码（tsx，改代码立即生效）
cd packages/problem-creator-cli && pnpm dev --help

# 方式三：构建产物
node packages/problem-creator-cli/dist/index.js --help
```

真实使用（假设已 `npm i -g`/`pnpm link` 或直接用 `pnpm dev`）：

```bash
qpc init my-problem --name "购物车合计" --difficulty easy
cd my-problem
qpc check                       # 毫秒级：判题脚本 / 快照 / 分值 / 运行配置
qpc check --judge               # 再让判题调度器编译一次脚本（需要调度器在跑）
qpc login --device              # 浏览器里授权登录（无需输入密码）
qpc upload --wait               # 上传并等待审计（约 20 秒，出检查点明细）
qpc publish 123                 # 审计通过后发布（123 是 upload 返回的 pid）
```

## 命令一览

| 命令 | 作用 | 需要登录 |
|---|---|---|
| `qpc init [dir]` | 生成题目骨架（配置、判题脚本、模板、参考解） | 否 |
| `qpc check [dir]` | 离线预检；`--strict` 让警告也失败，`--judge` 额外做服务端编译验证 | 否 |
| `qpc upload [dir]` | 上传并创建题目版本；默认等待审计结果 | 是 |
| `qpc status <pid>` | 查看状态与最近一次审计的检查点明细；`--watch` 持续刷新 | 是 |
| `qpc publish <pid>` | 发布（`ready → published`），`--unpublish` 下架 | 是 |
| `qpc login` | 登录并保存凭据；**`--device` 用设备码在浏览器授权（推荐）**；`--show` 查看状态，`--logout` 删除凭据 | 否 |
| `qpc doctor` | 自检：Node 版本、凭据文件权限、API 可达性、登录角色、判题调度器 | 否 |

全局参数（所有命令通用）：

```
--api <url>     Web 应用地址（默认 QUANTA_API_URL 或 http://localhost:3000）
--judge <url>   判题调度器地址（默认 QUANTA_JUDGE_URL 或 http://localhost:1888）
--token <token> 直接使用访问令牌（默认 QUANTA_TOKEN，不会落盘）
--cwd <dir>     指定题目根目录（解析顺序：--cwd > INIT_CWD > 进程 cwd）
--json          输出机器可读 JSON（stdout 只有一份结果，日志走 stderr）
--quiet        隐藏进度信息，只保留错误与命令结果
--verbose       输出调试信息（含错误堆栈、被忽略的文件等）
--no-color     关闭彩色输出（默认非 TTY 自动关闭）
-y, --yes      跳过交互确认（CI 必给）
```

## 退出码

CI 可以只依赖退出码判断结果：

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 运行时错误（含 doctor 检查失败） |
| 2 | 用法/配置错误（参数写错、`problem.config` 非法） |
| 3 | 预检或线上审计未通过（题目本身不合格） |
| 4 | 网络/服务端不可达或 5xx |
| 5 | 未登录、令牌失效、无管理员权限 |
| 130 | 被 Ctrl-C 中断 |

## 题目目录结构

`qpc init` 生成的就是标准结构：

```
my-problem/
├── problem.config.ts     # 唯一真源：标题、难度、标签、运行命令
├── judge.js              # 判题脚本（判分逻辑都在这）
├── template/index.html   # 答案模板：学生起点，通常拿低分
├── answer/index.html     # 参考解：必须满分；默认封面取它的首屏截图
└── README.md             # 出题流程备忘（可以删）
```

### `problem.config.ts`

```ts
import { defineProblemConfig } from '@challenge/problem-creator-cli';

export default defineProblemConfig({
   title: '购物车合计',
   detail: '题面（Markdown）',      // 或 detailFile: 'statement.md'
   difficulty: 'easy',              // easy | medium | hard | very_hard
   tagIds: [1],                     // 必须是库里已存在的标签 id（当前 1 = Vue3）
   // totalScore: 20,               // 留空 = 以检查点之和为准；填了就必须相等
   cover: { mode: 'default' },      // 或 { mode: 'custom', imageId: '<id>' }
   runtime: {
      judgeUploadPath: 'project',              // 判题打包目录 = 快照挂载路径
      initCommand: 'npx serve -l 3000 project', // 站点根必须等于上面那个目录
      buildCommand: undefined,                 // 需要构建时填写
   },
   paths: { template: 'template', answer: 'answer', judge: 'judge.js' },
});
```

配置文件由 [jiti](https://github.com/unjs/jiti) 加载，因此 `.ts` / `.mts` / `.js` / `.json` 都可以；
CLI 会把 `@challenge/problem-creator-cli` 别名到自身模块，
所以在**仓库之外**的目录里写 `import { defineProblemConfig }` 一样能工作
（IDE 补全需要该包作为依赖安装，或直接用普通对象 + `import type`）。

## 预检规则

`qpc check` 覆盖 `PROBLEM_AUTHORING.md` 检查清单里所有**可以静态判定**的项，
每条规则都能在 CI 里按编号定位。完整表格见 [`docs/RULES.md`](./docs/RULES.md)。

```text
$ qpc check
> 读取题目配置 → /path/to/my-problem
错误 × 1
  JUD004 judge.js:12 检查点「合计应为 10.50」的 handler 没有 return 分数
     handler 末尾补 `return 10;`。不 return 时即使断言全过也记 0 分。
> 预检结果
  检查点    3 个，合计 20 分
  答案模板  1 个文件，2.1 KB
  参考解    1 个文件，2.6 KB
  判题脚本  45 行
  结论      未通过（1 个错误）
```

预检**不能**替代线上审计：参考解是否真能拿满分、首屏封面好不好看，
只能在真实判题机上跑一遍。所以 `qpc upload --wait` 会把审计的检查点明细拉回来打印。

## 认证

三种方式，按推荐程度排序：

### 1. 设备码授权（推荐，无需输入密码）

```bash
qpc login --device
```

```
> 向 http://localhost:3000 申请设备授权码

请在浏览器中完成授权：
  地址：http://localhost:3000/auth/device
  验证码：WDJB-MJHT

> 等待授权完成（Ctrl-C 取消）
[ok] 已登录：admin · admin@example.com · ADMIN
```

流程（RFC 8628）：CLI 申请一对验证码 → 自动打开浏览器（已预填验证码）→
你在页面上核对验证码并点"同意" → CLI 轮询拿到 token 并落盘。

- 密码不经过 CLI（由浏览器在正规登录页处理），也不进 shell history。
- 验证码 **10 分钟**有效，输错超过 **5 次**会作废会话（RFC 8628 §5.1 的爆破防护）。
- 页面上会显示待授权的**账号与应用**，并列出即将授予的**权限**；必须显式点"同意"。
- 无浏览器环境（SSH/跳板机）：`qpc login --device --no-browser`，
  然后在**任意设备**的浏览器里打开打印出的地址并输入验证码。

### 2. 邮箱 + 密码

```bash
qpc login                       # 交互式，密码不回显
echo "$PASSWORD" | qpc login --password-stdin   # CI（推荐用管道而非参数）
```

### 3. 直接注入令牌（适合一次性脚本）

```bash
QUANTA_TOKEN=<粘贴 access token> qpc upload my-problem --wait
```

> 令牌来自浏览器 cookie `quanta_access_token`，**只适合临时使用**（15 分钟过期）。
> 用 `--token` / `QUANTA_TOKEN` 提供的令牌**不会被写入磁盘**。

### 凭据与续期（三种方式通用）

- 凭据保存在 `~/.config/quanta/credentials.json`（权限 0600，可用 `QUANTA_CONFIG_DIR` 覆盖）。
- access token 只有 15 分钟，命令会自动用 refresh token 调用 `GET /api/refresh` 续期；
  续期失败会明确提示重新 `qpc login`，而不是抛一个网络错误。
- 有 csrf token 时按服务端要求发送 `x-csrf-token`；只有 access token 时退回
  `x-ssr: 1` 通道（与仓库自带的 `scripts/smoke-test.mjs` 一致）。

## 目录结构（本包）

```
src/
├── index.ts        # bin 入口：装信号处理、设置退出码（唯一有副作用的地方）
├── program.ts      # 程序化入口：defineProblemConfig + 类型（零副作用）
├── cli.ts          # 命令树与顶层错误处理（可被测试直接调用）
├── commands/       # 每个子命令一个文件，只做编排与输出
├── core/           # context / env / errors / exit-codes / logger / runtime
├── domain/         # 纯业务：配置 schema、判题脚本静态分析、快照、预检规则
├── services/       # 外部交互：凭据、HTTP、tRPC、admin API、judge API、OAuth 设备码
├── ui/             # 输出渲染（人类可读报告 / JSON 负载）
├── utils/          # fs / paths / async / terminal / jwt 等小工具
└── templates/      # `qpc init` 的脚手架内容
tests/
├── unit/           # 领域逻辑 + 命令（用假 fetch，不发真实请求）
└── e2e/            # 真子进程跑 init → check
```

依赖方向单向：`commands → (domain | services | ui) → core/utils`。
`domain` 不 import `services`；`ui` 只把数据渲染成文本/JSON，不发请求。
因此判题脚本分析、快照、预检规则都能脱离网络与 CLI 单独测试。

## 开发

```bash
pnpm dev <args>        # tsx 直跑源码
pnpm test              # vitest
pnpm test:coverage     # 覆盖率（阈值 70%）
pnpm lint              # biome check（格式化 + lint）
pnpm typecheck         # tsc --noEmit（含 examples）
pnpm build             # tsup → dist/（index.js 带 shebang，program.js 为库入口）
pnpm verify            # lint + typecheck + test + build
```

约定：

- 3 空格缩进、单引号、行宽 80（由 biome 强制，配置见 `biome.json`）。
- `examples/` 是 `qpc init` 的产物，**不参与 lint**（它同时也是 e2e 的 fixture）。
- 新增规则时必须同时补 `docs/RULES.md` 与 `tests/unit/validate.test.ts` 的用例。

## 相关文档

- `docs/PROBLEM_AUTHORING.md`（仓库根）：出题的实战踩坑清单，本工具规则的事实来源。
- `docs/ARCHITECTURE.md`：模块划分、数据流、设计取舍（含 OAuth 设备码流程的安全决策）。
- `docs/RULES.md`：预检规则编号表。
- `docs/OAUTH_DEVICE_FLOW.md`：设备码授权的协议实现与服务端配合说明。
