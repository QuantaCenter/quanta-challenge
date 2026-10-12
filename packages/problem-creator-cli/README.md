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
# 不写 --type 会弹出方向键菜单（↑/↓ 选择，回车确认）；也可显式指定
qpc init my-problem --type frontend --name "购物车合计" --difficulty easy
cd my-problem
qpc check                       # 毫秒级：判题脚本 / 快照 / 分值 / 运行配置
qpc login                       # 默认设备码授权（浏览器里确认，无需密码）
qpc upload               # 上传并等待审计（约 20 秒，出检查点明细）
qpc publish 123                 # 审计通过后发布（123 是 upload 返回的 pid）

# 后端服务题：常驻进程 + HTTP 判题（模板不同，且默认生成封面图）
qpc init my-api --type backend_service --name "待办清单 HTTP API"
cd my-api
qpc cover --upload --write      # 后端没有首屏可截图，先生成/上传封面并写回 imageId
qpc check
qpc upload
```

## 命令一览

| 命令 | 作用 | 需要登录 |
|---|---|---|
| `qpc init [dir]` | 生成题目骨架（配置、判题脚本、模板、参考解）；`--type` 选题型，不传则**方向键交互选择** | 否 |
| `qpc check [dir]` | 离线预检；`--strict` 让警告也失败 | 否 |
| `qpc cover [dir]` | 从题目配置生成封面图；`--random` 随机生成合理配色，`--upload` 上传，`--write` 把 imageId 与配色写回配置 | 上传时 |
| `qpc tag [dir]` | 查看平台标签；`--write` 交互多选、`--set <id...>` 直接指定，把 tagIds 写回配置 | 否 |
| `qpc upload [dir]` | 上传题目：配置了 `problemId` 就追加新版本，否则新建；默认等待审计结果 | 是 |
| `qpc status <pid>` | 查看状态与最近一次审计的检查点明细；`--watch` 持续刷新 | 是 |
| `qpc publish <pid>` | 发布（`ready → published`），`--unpublish` 下架 | 是 |
| `qpc login` | 登录并保存凭据；**默认走设备码授权**，密码登录用 `--email` / `--password-stdin`；`--show` 查看状态，`--logout` 删除凭据 | 否 |
| `qpc doctor` | 自检：Node 版本、凭据文件权限、API 可达性、登录角色 | 否 |

全局参数（所有命令通用）：

```
--api <url>     Web 应用地址（默认 QUANTA_API_URL 或 http://localhost:3000）
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

`qpc init` 生成的就是标准结构。用 `--type` 选择题型，两套模板不一样；**不传 `--type` 时会弹出方向键菜单让你选**（`↑/↓` 移动、回车确认、Ctrl-C 取消）：

```text
◆  请选择题型
│  ● 前端题（frontend）         静态站点，用 Playwright 判题
│  ○ 后端服务题（backend_service）  常驻进程，用 HTTP 判题
└  ↑/↓ to navigate • Enter: confirm
```

非交互环境（管道 / CI）、`--yes`、`--json` 下不提问，直接默认 `frontend`，脚本行为与之前一致。

```
# 前端题（--type frontend，默认）
my-problem/
├── problem.config.ts     # 唯一真源：标题、难度、标签、运行命令
├── judge.js              # 判题脚本（判分逻辑都在这）
├── template/index.html   # 答案模板：学生起点，通常拿低分
├── answer/index.html     # 参考解：必须满分；默认封面取它的首屏截图
└── README.md             # 出题流程备忘（可以删）

# 后端服务题（--type backend_service）
my-api/
├── problem.config.ts     # type: 'backend_service'，含镜像 / 端口 / 启动命令
├── detail.md             # 题面（后端题接口清单长，默认拆成单独 markdown）
├── judge.js              # 判题脚本：用 http 发请求、断言响应
├── template/             # 学生起点（package.json + server.js + pnpm-lock.yaml）
├── answer/               # 参考解：必须满分（同样含锁文件）
├── cover.png             # init 已按 cover.generate 渲染好（还没上传）
└── README.md
```

后端题与前端题的差异（详见 [`docs/BACKEND_SERVICE_PROBLEM.md`](../../docs/BACKEND_SERVICE_PROBLEM.md)）：

- 判题脚本用 `defineTestHandler(async ({ http, $ }) => ...)`，不是 `page`。
- **没有首屏可截图**，必须自定义封面：`--type backend_service` 会写好
  `cover: { mode: 'custom', generate: {...} }` 并本地渲染 `cover.png`，
  但仍需跑一次 `qpc cover --upload --write` 上传换 `imageId`（否则 `IMG001` 会拦下）。
- `template/` 与 `answer/` 是两份独立工程，都要有 `pnpm-lock.yaml`（容器断网离线安装）。
- `runtime.bootCommand` 由初始镜像决定，不用手写；服务启动命令写 `runtime.initCommand`。

### `problem.config.ts`

```ts
import { defineProblemConfig } from '@challenge/problem-creator-cli';

export default defineProblemConfig({
   title: '购物车合计',
   problemId: 123,                 // 首次上传后用 --write 写回；有它才会追加新版本
   detail: '题面（Markdown）',      // 或 detailFile: 'statement.md'
   difficulty: 'easy',              // easy | medium | hard | very_hard
   tagIds: [1],                     // 必须是库里已存在的标签 id（用 `qpc tag` 查看/选择）
   // totalScore: 20,               // 留空 = 以检查点之和为准；填了就必须相等
   cover: { mode: 'default' },      // 或 { mode: 'custom', imageId: '<id>' }
   // 后端题型（没有首屏可截图）用这条替代上面那行，再跑
   // `qpc cover --upload --write` 自动生成并填好 imageId：
   // cover: { mode: 'custom', generate: { bg: '#0F172A', bgTo: '#14432A' } },
   runtime: {
      judgeUploadPath: 'project',              // 判题打包目录 = 快照挂载路径
      initCommand: 'npx serve -l 3000 project', // 站点根必须等于上面那个目录
      buildCommand: 'echo built',             // 编辑器点「提交」会先跑它；没有构建步骤也写一条（RUN004）
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
只能在真实判题机上跑一遍。所以 `qpc upload` 会把审计的检查点明细拉回来打印。

## 标签（`qpc tag`）

`tagIds` 必须是平台标签库里已有的 id，以前只能靠文档里那句「当前 1 = Vue3」，换个环境就失效。
`qpc tag` 直接从平台拉取（`public.tag.list`，**无需登录**）并把本题的标签写回配置：

```bash
qpc tag                       # 列出全部标签（id / 名称 / 颜色）
qpc tag --write               # 方向键多选（空格切换、回车确认），写回 tagIds
qpc tag --set 1,3             # 直接指定 id，写回（CI / 非交互）
```

写回复用与 `problemId` / `imageId` 相同的做法：原子写盘，写完重新加载校验，对不上就回滚。
`tagIds` 缺失的旧配置也能用 `--set` / `--write` 补上（不会因为 schema 先校验而卡住）。
非交互环境里 `--write` 会报用法错误，提示改用 `--set`。

## 上传与版本管理（`qpc upload`）

服务端上一道题分为「基础题（base）」与「版本（pid）」两层。默认情况下 `qpc upload`
每次都会**新建一道基础题**，改稿越改越乱。把 `problemId`（`qpc upload` 返回的
pid）写进配置后，后续上传就会在**同一道题下追加新版本**（服务端的 `reupload`），
旧版本保留、可在管理端切回：

```bash
# 首次：新建题目，并把返回的 pid 写回配置
qpc upload --write

# 之后：默认就在该题目下追加新版本（无需再传 --problem）
qpc upload
```

`--write` 会就地改写配置文件并重新加载校验，对不上就回滚（与 `qpc cover --write`
同一套做法）。**只在整条命令成功后才写回**：审计未通过时不会写回 `problemId`，
避免配置指向一道无效的题（`--no-wait` 时上传成功即写回）。写盘是原子的
（临时文件 + rename），中途失败不会把配置截断。也可以手动把 id 填进 `problemId`，
或在命令上临时指定：

| 参数 | 说明 |
|---|---|
| `--problem <pid>` | 本次在该题目下追加新版本（覆盖配置里的 `problemId`） |
| `--new` | 强制新建题目（忽略配置里的 `problemId`，与 `--problem` 互斥） |
| `--write` | 把本次创建/追加后的题目 id 写回配置 |

> 追加版本前会先按 `problemId` 查出基础题 id，因此该 id 必须属于当前账号；
> 不写 `--write` 时配置里的 `problemId` 保持原值同样有效（任意一个版本的 pid
> 都能定位到它的基础题）。

## 封面生成（`qpc cover`）

后端题型没有首屏可截图，**必须**用自定义封面，而自定义封面需要一个平台上的
`imageId`——以前只能去发布页手动传图、再把 id 抄回配置。现在在配置里声明配色，
一条命令生成、上传、写回：

```ts
export default defineProblemConfig({
   title: '图书库存查询与借阅 HTTP API',
   cover: {
      mode: 'custom',
      // 配色/排版；qpc cover 读它渲染，服务端不感知这几项
      generate: {
         bg: '#0F172A',        // 背景色（纯色）
         bgTo: '#14432A',      // 给了就是对角线渐变
         accent: '#A6FB1D',    // 左侧竖条 + 副标题
         subtitle: 'GET /books  POST /borrow',
      },
   },
});
```

```bash
qpc cover --upload --write     # 生成 cover.png → 上传 → 把 imageId 写回配置
```

执行顺序与产物：渲染 PNG 到 `cover.generate.out`（默认 `cover.png`）→
`admin.image.upload` 拿到 id → 就地改写配置文件里的 `imageId`，
**写完会立刻重新加载配置校验一遍，对不上就回滚**（改坏配置比没改更糟）。
写盘是原子的（临时文件 + rename），中途失败不会把配置截断。

命令行参数会覆盖配置里的同名项，方便临时试配色（颜色优先级：**显式参数 >
`--random` > 配置 > 默认值**）：

```bash
qpc cover --bg "#101828" --bg-to "#123B2A" --subtitle "GET /health"
qpc cover --out /tmp/preview.png --width 1600 --height 900
qpc cover                      # 只生成，不上传：本地看一眼再说
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `--out <file>` | 输出文件（相对题目目录） | 配置里的 `generate.out`，否则 `cover.png` |
| `--bg <color>` | 背景色 | `#0F172A` |
| `--bg-to <color>` | 渐变终止色，给了就画渐变 | 无（纯色） |
| `--accent <color>` | 强调色（竖条 / 副标题） | `#A6FB1D` |
| `--text <color>` | 主标题颜色 | `#F8FAFC` |
| `--subtitle <text>` | 副标题；传空字符串则不渲染 | 配置里的 `generate.subtitle` |
| `--footer <text>` | 左下角页脚 | `Quanta Challenge` |
| `--width/--height <px>` | 画布尺寸（200~4096） | `1200 × 675` |
| `--random` | 随机生成一套**合理**配色（背景 / 渐变 / 强调色 / 标题色） | 否 |
| `--seed <n>` | 配合 `--random`：固定随机种子，复现同一套配色 | 无（每次随机） |
| `--upload` | 上传到平台，输出可用的 `imageId` | 否 |
| `--write` | 把 `imageId` 与 `--random` 配色写回配置（隐含 `--upload`） | 否 |

### 随机配色（`--random`）

没有配色灵感时，让 CLI 抽一套：

```bash
qpc cover --random                  # 生成一套，并打印可复现的 seed
qpc cover --random --seed 42        # 用指定种子复现
qpc cover --random --upload --write # 随机配色 + 上传 + 写回 imageId
```

「随机」不是「乱抽」，每套都满足两条硬约束：

- **可读**：主标题对背景 ≥ **7:1**、强调色对背景 ≥ **4.5:1**（WCAG 对比度）。
  不达标就调整明度直到达标，而不是抽到就用。
- **和谐**：强调色色相按配色关系（同色系 / 邻近色 / 分裂互补 / 互补 / 三角）
  从背景色相推导；背景固定在「深色 + 中等饱和」的窄带里，排除刺眼与发灰的组合。

随机由**种子**驱动，同一个 seed 永远得到同一套配色。输出里会打印 seed 与配色
关系（例如 `暗紫 · 分裂互补`），`--seed <n>` 可复现。`--random --write` 会把
配色一并写进 `cover.generate`（保留 `subtitle`、`out` 等字段）；只 `--upload`
不改配置。

`--random` 产出的是整组协调的深色配色；若再显式传 `--bg` / `--text` 等把对比度
覆盖到不达标，命令会**直接拒绝并说明是哪一对颜色**（例如白底 + 近白标题），
而不是输出一张看不清的封面。

颜色只收十六进制（`#rgb` / `#rrggbb`）：这些值会被拼进 SVG，
放行任意字符串等于把「配色参数」变成注入点。

排版由 CLI 自己算（按 `width / 1200` 等比缩放）：标题按显示宽度贪心换行
（优先断在空格 / 汉字边界），再从基准字号向下收敛到能塞进 3 行，
左侧竖条自动跟随标题高度。所以标题很长也不会溢出画布。

## 认证

三种方式，按推荐程度排序：

### 1. 设备码授权（默认，无需输入密码）

```bash
qpc login              # 不带任何参数即设备码；--device 仍可显式指定
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
- 无浏览器环境（SSH/跳板机）：`qpc login --no-browser`，
  然后在**任意设备**的浏览器里打开打印出的地址并输入验证码。

### 2. 邮箱 + 密码（显式指定）

```bash
qpc login --email you@example.com               # 交互式，密码不回显
echo "$PASSWORD" | qpc login --email you@example.com --password-stdin   # CI
```

> 只有给了 `--email` / `--password-stdin` 才会走密码登录；
> `QUANTA_EMAIL` / `QUANTA_PASSWORD` 只是这两个参数的取值来源，
> 单独存在时不会改变默认（设备码）行为。

### 3. 直接注入令牌（适合一次性脚本）

```bash
QUANTA_TOKEN=<粘贴 access token> qpc upload my-problem
```

> 令牌来自浏览器 cookie `quanta_access_token`，**只适合临时使用**（15 分钟过期）。
> 用 `--token` / `QUANTA_TOKEN` 提供的令牌**不会被写入磁盘**。

### 凭据与续期（三种方式通用）

- 凭据保存在 `~/.config/quanta/credentials.json`（权限 0600，可用 `QUANTA_CONFIG_DIR` 覆盖）。
- access token 只有 15 分钟，命令会自动用 refresh token 调用 `GET /api/refresh` 续期；
  续期失败会明确提示重新 `qpc login`，而不是抛一个网络错误。
- 有 csrf token 时按服务端要求发送 `x-csrf-token`；只有 access token 时退回
  `x-ssr: 1` 通道。

## 目录结构（本包）

```
templates/          # `qpc init` 的脚手架内容（按题型分目录的真实文件）
├── frontend/       # 前端题：problem.config.ts / judge.js / template / answer
└── backend_service/# 后端服务题：另有 detail.md 与两份可离线安装的 Node 工程
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
└── templates/      # 读 `templates/`、替换占位符、组装成 ScaffoldFile[]
```

脚手架模板是**真实文件**（不是塞在源码里的模板串），可以按真实语言高亮/校验；
文件里用 `{{title}}` / `{{mountPath}}` 等占位符，`qpc init` 生成时一次性插值，
产物里不留任何 `{{...}}`（引用了未知占位符会直接报内部错误）。
`templates/**/gitignore` 交付时改名为 `.gitignore`——源码里叫 `.gitignore` 会被 git 当成忽略规则。

依赖方向单向：`commands → (domain | services | ui) → core/utils`。
`domain` 不 import `services`；`ui` 只把数据渲染成文本/JSON，不发请求。
因此判题脚本分析、快照、预检规则都能脱离网络与 CLI 单独调用。

## 开发

```bash
pnpm dev <args>        # tsx 直跑源码
pnpm lint              # biome check（格式化 + lint）
pnpm typecheck         # tsc --noEmit（含 examples）
pnpm build             # tsup → dist/（index.js 带 shebang，program.js 为库入口）
pnpm verify            # lint + typecheck + build
```

约定：

- 3 空格缩进、单引号、行宽 80（由 biome 强制，配置见 `biome.json`）。
- `examples/` 是 `qpc init` 的产物，**不参与 lint**。
- 新增规则时必须同时补 `docs/RULES.md`。

## 相关文档

- `docs/PROBLEM_AUTHORING.md`（仓库根）：出题的实战踩坑清单，本工具规则的事实来源。
- `docs/ARCHITECTURE.md`：模块划分、数据流、设计取舍（含 OAuth 设备码流程的安全决策）。
- `docs/RULES.md`：预检规则编号表。
- `docs/OAUTH_DEVICE_FLOW.md`：设备码授权的协议实现与服务端配合说明。
