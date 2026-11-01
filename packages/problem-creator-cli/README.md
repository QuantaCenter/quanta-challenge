# @challenge/problem-creator-cli

出题 CLI：脚手架生成、离线预检、上传、审计等待、发布。

## 快速开始

```bash
pnpm --filter @challenge/problem-creator-cli build   # 仓库根执行

pnpm qpc --help                                      # 从仓库根调用
cd packages/problem-creator-cli && pnpm dev --help   # tsx 直跑源码
node packages/problem-creator-cli/dist/index.js --help   # 构建产物
```

基本流程（Agent 使用者先运行 `qpc agent`，手册随版本分发）：

```bash
qpc login --api https://challenge.quantacenter.com   # 设备码授权
qpc init my-problem --type frontend --name "购物车合计" --difficulty easy
cd my-problem
qpc agent                  # 判题脚本编写手册（前端 / 后端 / Type Schema）
qpc tag --write 1,2        # 指定标签
qpc gen-img flow "输入" "计算" "输出"   # 生成题面插图到 images/，写进题面后：
qpc image --write          # 上传题面里的本地图片并回写地址
qpc check                  # 基础信息检查 + 本地微判题
qpc upload --write         # 上传审核，成功后把 pid 写回 problemId
qpc publish 123            # 发布，123 为 upload 输出的当前版本 pid
```

后端服务题（`--type backend_service`）：模板不同，无首屏可截图，需先生成封面：

```bash
qpc init my-api --type backend_service --name "待办清单 HTTP API"
cd my-api
qpc cover --upload --write   # 生成封面并写回 imageId
qpc check
qpc upload --wait
```

## 命令一览

| 命令 | 作用 | 需要登录 |
|---|---|---|
| `qpc agent [topic]` | 给 Agent 的使用手册：题目目录外是 CLI 手册，题目目录内是判题脚本编写手册；`--list` 列章节，`dts` 输出完整类型声明 | 否 |
| `qpc init [dir]` | 生成题目骨架（含 `AGENTS.md`）；`--type` 选题型，不传时交互选择 | 否 |
| `qpc tag [dir]` | 查看平台标签；`--write` 交互多选，`--write 1,2`（或 `--set`）直接写回 tagIds | 否 |
| `qpc snapshot-image [dir]` | 查看平台快照镜像；`--write` 交互单选，`--write <id>`（或 `--set`）直接写回 snapshotImageId，`none` 表示不使用 | 是 |
| `qpc gen-img flow\|svg\|screenshot\|record\|frames` | 生成题面插图到 `images/`：流程图 / SVG 转 PNG / 参考解页面截图 / 参考解动效录成 GIF / 多帧拼 GIF | 否 |
| `qpc image [files...]` | 上传图片；不给文件时上传题面里引用的全部本地图片，`--write` 回写地址 | 是 |
| `qpc cover [dir]` | 生成封面图；`--random` 随机配色、`--upload` 上传、`--write` 写回配置 | 上传时 |
| `qpc check [dir]` | ① 基础信息静态预检 ② 本地微判题（answer 须满分）；`--no-run` 只做 ①，`--strict` 使警告也算失败 | 否 |
| `qpc upload [dir]` | 上传题目：配置了 `problemId` 追加新版本，否则新建；默认等待审计 | 是 |
| `qpc status <pid>` | 查看状态与最近一次审计的检查点明细；`--watch` 持续刷新 | 是 |
| `qpc publish <pid>` | 发布（`ready → published`）；`--unpublish` 下架 | 是 |
| `qpc login` | 登录并保存凭据；默认设备码授权，密码登录用 `--email` / `--password-stdin` | 否 |
| `qpc doctor` | 自检：Node 版本、凭据权限、API 可达性、登录角色 | 否 |

全局参数：

```
--api <url>     Web 应用地址（默认 QUANTA_API_URL 或 http://localhost:3000）
--token <token> 访问令牌（默认 QUANTA_TOKEN，不落盘）
--cwd <dir>     题目根目录（解析顺序：--cwd > INIT_CWD > 进程 cwd）
--json          输出 JSON（stdout 只有一份结果，日志走 stderr）
--quiet         隐藏进度信息
--verbose       调试信息（错误堆栈、被忽略的文件等）
--no-color      关闭彩色输出（非 TTY 默认关闭）
-y, --yes       跳过交互确认
```

## 退出码

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 运行时错误（含 doctor 检查失败） |
| 2 | 用法/配置错误 |
| 3 | 预检或审计未通过 |
| 4 | 网络/服务端不可达或 5xx |
| 5 | 未登录、令牌失效、无权限 |
| 130 | Ctrl-C 中断 |

## 题目目录结构

`--type` 选择题型；非交互环境（管道/CI）、`--yes`、`--json` 下默认 `frontend`。

```
# frontend（默认）
my-problem/
├── problem.config.ts     # 配置：标题、难度、标签、运行命令
├── judge.js              # 判题脚本
├── template/index.html   # 学生起点，通常低分
├── answer/index.html     # 参考解，必须满分；默认封面取首屏截图
├── AGENTS.md             # 给 Agent 的入口说明（指向 qpc agent）
└── README.md

# backend_service
my-api/
├── problem.config.ts     # type: 'backend_service'，含镜像/端口/启动命令
├── detail.md             # 题面
├── judge.js              # 用 http 发请求、断言响应
├── template/             # 学生起点（含 pnpm-lock.yaml）
├── answer/               # 参考解（含 pnpm-lock.yaml）
├── AGENTS.md             # 给 Agent 的入口说明
└── cover.png             # init 已按 cover.generate 渲染，未上传
```

题面插图由 `qpc gen-img` 输出到 `images/`（不进入快照），`qpc image --write` 上传后回写为 `/api/static/<名字>`。

后端题差异（详见 [`docs/BACKEND_SERVICE_PROBLEM.md`](../../docs/BACKEND_SERVICE_PROBLEM.md)）：

- 判题脚本用 `defineTestHandler(async ({ http, $ }) => ...)`，不是 `page`。
- 必须自定义封面：`--type backend_service` 会写好 `cover: { mode: 'custom', generate: {...} }` 并本地渲染 `cover.png`，仍需 `qpc cover --upload --write` 上传获取 `imageId`（否则 `IMG001` 拦截）。
- `template/` 与 `answer/` 是独立工程，均需 `pnpm-lock.yaml`（容器离线安装）。
- `runtime.bootCommand` 由镜像决定；服务启动命令写 `runtime.initCommand`。

### `problem.config.ts`

```ts
import { defineProblemConfig } from '@challenge/problem-creator-cli';

export default defineProblemConfig({
   title: '购物车合计',
   problemId: 123,            // 首次上传后写回；有它才追加新版本
   detail: '题面（Markdown）',  // 或 detailFile: 'statement.md'
   difficulty: 'easy',         // easy | medium | hard | very_hard
   tagIds: [1],                // 必须是已有标签 id（qpc tag 查看）
   // snapshotImageId: 'cm…',  // 启动命令用到的依赖在某个快照镜像里时必填（qpc snapshot-image 查看）
   // totalScore: 20,          // 留空取检查点之和
   cover: { mode: 'default' }, // 后端题用 { mode: 'custom', generate: {...} }
   runtime: {
      judgeUploadPath: 'project',               // = 快照挂载路径
      initCommand: 'npx serve -l 3000 project', // 站点根须等于该目录
      buildCommand: undefined,
   },
   paths: { template: 'template', answer: 'answer', judge: 'judge.js' },
});
```

配置由 [jiti](https://github.com/unjs/jiti) 加载，支持 `.ts` / `.mts` / `.js` / `.json`。CLI 将 `@challenge/problem-creator-cli` 别名到自身模块，仓库外目录同样可用（IDE 补全需安装该包，或用普通对象 + `import type`）。

## 预检规则

`qpc check` 覆盖 `PROBLEM_AUTHORING.md` 中可静态判定的项，规则按编号可在 CI 中定位。完整表格见 [`docs/RULES.md`](./docs/RULES.md)。

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

预检不能替代线上审计（参考解是否满分、封面效果需真实判题机验证）。`qpc upload --wait` 会拉回并打印审计的检查点明细。

## 标签（`qpc tag`）

`tagIds` 必须是平台标签库里已有的 id。`qpc tag` 从平台拉取（`public.tag.list`，无需登录）并写回配置：

```bash
qpc tag            # 列出全部标签（id / 名称 / 颜色）
qpc tag --write    # 交互多选，写回 tagIds
qpc tag --set 1,3  # 指定 id，写回（CI / 非交互）
```

写回为原子写盘，写完重新加载校验，失败回滚。旧配置缺 `tagIds` 也可用 `--set` / `--write` 补上。非交互环境 `--write` 报用法错误。

## 快照镜像（`qpc snapshot-image`）

快照镜像在做题页的 WebContainer 启动时挂载（预装依赖，不参与判题），由管理员在管理端「快照镜像」里构建。启动命令（`runtime.initCommand`）用到的工具或依赖（如 `vite`）如果已包含在某个快照镜像里，就要填上它：依赖直接挂载、不用现场下载，做题页启动更快。`qpc snapshot-image` 从平台拉取（`admin.imageBuild.list`，需登录），用法与 `qpc tag` 一致：

```bash
qpc snapshot-image              # 列出全部快照镜像（id / 名称 / 大小 / 引用数）
qpc snapshot-image --write      # 交互单选，写回 snapshotImageId
qpc snapshot-image --set <id>   # 指定 id，写回（CI / 非交互）；none 表示不使用
```

`snapshotImageId` 有三种状态：写了 id 就用它；写 `null` 表示明确不用（追加版本时会解绑平台上的快照镜像）；不写时新题不用，追加版本沿用平台上当前版本的值。只能选已就绪的镜像；已发布的题只改快照镜像时直接生效，不重新审核。

## 上传与版本管理（`qpc upload`）

服务端题目分「基础题（base）」与「版本（pid）」两层。默认每次上传新建基础题；配置 `problemId` 后在同一题下追加新版本（`reupload`），旧版本保留。

```bash
qpc upload --write   # 首次：新建题目并写回 pid
qpc upload           # 之后：追加新版本
```

`--write` 只在命令成功后写回：审计未通过时不写回 `problemId`（`--no-wait` 时上传成功即写回）。写盘原子（临时文件 + rename），写完重新校验，失败回滚。

| 参数 | 说明 |
|---|---|
| `--problem <pid>` | 本次在该题目下追加版本（覆盖配置 `problemId`） |
| `--new` | 强制新建题目（与 `--problem` 互斥） |
| `--write` | 写回题目 id |

追加版本前按 `problemId` 查基础题 id，该 id 须属于当前账号。任意版本的 pid 均可定位基础题。

## 封面生成（`qpc cover`）

后端题型必须自定义封面，需平台 `imageId`。在配置声明配色后一条命令完成生成、上传、写回：

```ts
export default defineProblemConfig({
   cover: {
      mode: 'custom',
      generate: {
         bg: '#0F172A',      // 背景色（纯色）
         bgTo: '#14432A',    // 提供时为对角线渐变
         accent: '#A6FB1D',  // 竖条 + 副标题颜色
         subtitle: 'GET /books  POST /borrow',
      },
   },
});
```

```bash
qpc cover --upload --write   # 渲染 cover.png → 上传 → 写回 imageId
```

流程：渲染 PNG 到 `cover.generate.out`（默认 `cover.png`）→ `admin.image.upload` 获取 id → 写回配置 `imageId`。写盘原子，写完重新加载校验，失败回滚。

命令行参数覆盖配置同名项（优先级：显式参数 > `--random` > 配置 > 默认值）：

```bash
qpc cover --bg "#101828" --bg-to "#123B2A" --subtitle "GET /health"
qpc cover --out /tmp/preview.png --width 1600 --height 900
qpc cover                     # 只生成，不上传
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `--out <file>` | 输出文件（相对题目目录） | `generate.out` 或 `cover.png` |
| `--bg <color>` | 背景色 | `#0F172A` |
| `--bg-to <color>` | 渐变终止色，提供时画渐变 | 无 |
| `--accent <color>` | 强调色（竖条 / 副标题） | `#A6FB1D` |
| `--text <color>` | 主标题颜色 | `#F8FAFC` |
| `--subtitle <text>` | 副标题；空字符串不渲染 | `generate.subtitle` |
| `--footer <text>` | 左下角页脚 | `Quanta Challenge` |
| `--width/--height <px>` | 画布尺寸（200~4096） | `1200 × 675` |
| `--random` | 随机生成配色 | 否 |
| `--seed <n>` | 固定随机种子 | 无 |
| `--upload` | 上传并输出 `imageId` | 否 |
| `--write` | 写回 `imageId` 与 `--random` 配色（隐含 `--upload`） | 否 |

### 随机配色（`--random`）

```bash
qpc cover --random                  # 生成并打印 seed
qpc cover --random --seed 42        # 用种子复现
qpc cover --random --upload --write # 随机配色 + 上传 + 写回
```

约束：

- 主标题对背景对比度 ≥ 7:1、强调色对背景 ≥ 4.5:1（WCAG）；不达标时调整明度。
- 强调色色相按配色关系（同色系/邻近色/分裂互补/互补/三角）从背景推导；背景固定在深色、中等饱和范围。

同一 seed 生成同一套配色。`--random --write` 将配色写进 `cover.generate`（保留其他字段）。显式参数覆盖导致对比度不达标时，命令拒绝执行并指出对应颜色。

颜色仅接受十六进制（`#rgb` / `#rrggbb`）——值会拼进 SVG，限制格式防止注入。

排版按 `width / 1200` 等比缩放：标题按显示宽度换行（空格/汉字边界），字号向下收敛至 3 行内，竖条随标题高度。

## 认证

### 1. 设备码授权（默认）

```bash
qpc login    # 不带参数即设备码；--device 显式指定
```

```
> 向 http://localhost:3000 申请设备授权码

请在浏览器中完成授权：
  地址：http://localhost:3000/auth/device
  验证码：WDJB-MJHT

> 等待授权完成（Ctrl-C 取消）
[ok] 已登录：admin · admin@example.com · ADMIN
```

流程（RFC 8628）：CLI 申请验证码 → 打开浏览器（预填验证码）→ 页面核对并确认 → CLI 轮询获取 token 落盘。

- 密码不经过 CLI，不进 shell history。
- 验证码 10 分钟有效，输错 5 次作废会话（RFC 8628 §5.1）。
- 页面显示账号、应用与权限，需显式确认。
- 无浏览器环境（SSH）：`qpc login --no-browser`，在其他设备打开地址输入验证码。

### 2. 邮箱 + 密码

```bash
qpc login --email you@example.com               # 交互式，密码不回显
echo "$PASSWORD" | qpc login --email you@example.com --password-stdin
```

仅提供 `--email` / `--password-stdin` 时走密码登录；`QUANTA_EMAIL` / `QUANTA_PASSWORD` 只是这两个参数的取值来源，不改变默认行为。

### 3. 注入令牌

```bash
QUANTA_TOKEN=<access token> qpc upload my-problem --wait
```

令牌来自浏览器 cookie `quanta_access_token`，15 分钟过期，仅临时使用。`--token` / `QUANTA_TOKEN` 提供的令牌不落盘。

### 凭据与续期

- 凭据保存在 `~/.config/quanta/credentials.json`（权限 0600，`QUANTA_CONFIG_DIR` 覆盖）。
- access token 15 分钟，自动用 refresh token 调 `GET /api/refresh` 续期；失败提示重新 `qpc login`。
- 有 csrf token 时发送 `x-csrf-token`；否则退回 `x-ssr: 1` 通道。

## 目录结构（本包）

```
agent/              # qpc agent 的手册章节（随包分发；.d.ts 构建时从 Web 应用拷到 dist/agent-types）
templates/          # qpc init 的脚手架内容（按题型分目录）
├── frontend/       # 前端题模板
└── backend_service/# 后端题模板（含 detail.md 与两份 Node 工程）
src/
├── index.ts        # bin 入口：信号处理、退出码（唯一有副作用处）
├── program.ts      # 程序化入口：defineProblemConfig + 类型
├── cli.ts          # 命令树与顶层错误处理
├── commands/       # 每个子命令一个文件，编排与输出
├── core/           # context / env / errors / exit-codes / logger / runtime
├── domain/         # 配置 schema、判题脚本静态分析、快照、预检规则
├── services/       # 凭据、HTTP、tRPC、admin API、OAuth 设备码；local-judge/ 本地微判题（沙箱、静态服务器、无头浏览器）
├── ui/             # 输出渲染（文本 / JSON）
├── utils/          # fs / paths / async / terminal / jwt
└── templates/      # 读 templates/、替换占位符、组装 ScaffoldFile[]
```

- 脚手架模板是真实文件，用 `{{title}}` / `{{mountPath}}` 等占位符，`qpc init` 时插值；未知占位符报内部错误。
- `templates/**/gitignore` 交付时改名为 `.gitignore`。
- 依赖方向单向：`commands → (domain | services | ui) → core/utils`；`domain` 不依赖 `services`，`ui` 不发请求。判题脚本分析、快照、预检规则可独立调用。

## 开发

```bash
pnpm dev <args>   # tsx 直跑源码
pnpm lint         # biome check
pnpm typecheck    # tsc --noEmit
pnpm build        # tsup → dist/
pnpm verify       # lint + typecheck + build
```

- 3 空格缩进、单引号、行宽 80（biome，配置见 `biome.json`）。
- `examples/` 是 `qpc init` 产物，不参与 lint。
- 新增规则须同步补 `docs/RULES.md`。

## 相关文档

- `docs/PROBLEM_AUTHORING.md`（仓库根）：出题流程与约定。
- `docs/ARCHITECTURE.md`：模块划分、数据流、设计取舍。
- `docs/RULES.md`：预检规则编号表。
- `docs/OAUTH_DEVICE_FLOW.md`：设备码授权实现与服务端配合。
- `docs/BACKEND_SERVICE_PROBLEM.md`：后端服务题说明。
