# 变更记录

本文件按时间倒序记录 `qpc` 的行为变化。格式参考
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号沿用语义化版本。

## [Unreleased]

面向 Agent 出题的改造（依据 1.0.2 实际出题反馈）。

### Added

- `qpc agent [topic]`：随版本分发的使用手册。题目目录外输出 CLI 手册（是什么、出题流程），
  题目目录内输出判题脚本编写手册（前端 / 后端 / Type Schema，本题题型排前）；
  `--list` 列章节，`dts` 输出完整 `.d.ts`，`--json` 机读。`qpc --help` 首行提示先运行它。
- `qpc init` 生成 `AGENTS.md`，Cursor / Codex / Claude Code 等会自动读取。
- `qpc check` 新增第 ② 步**本地微判题**：在与线上判题机同构的沙箱（同样的 `$` / 去掉 goto 的
  `page` / 受限 `http`、20 秒预算、没有 `setTimeout`）里对 `answer/`、`template/` 各跑一遍，
  新增规则 LOC001~LOC005；`--no-run` 跳过。前端题依次尝试 Playwright Chromium / 本机 Chrome / Edge
  （新增依赖 `playwright-core@1.54.1`，与判题机同版本，不自动下载浏览器）；后端题在目录里 `npm start`。
- `qpc gen-img flow | svg | screenshot`：生成题面插图到 `images/`，并给出可直接写进题面的 Markdown。
- `qpc image [files...] [--write]`：上传题面引用的本地图片并把路径回写为 `/api/static/<名字>`；
  按内容哈希缓存在 `.qpc/images.json`，重跑幂等。新增规则 IMG003（题面引用了本地图片）。
- `qpc tag --write 1,2`：非交互环境直接写回标签；标签说明默认展示。

### Changed

- `qpc upload` 审计失败分三类并给出机读错误码：`AUDIT_INFRA_ERROR`（平台故障，退出码 4，
  `retryable: true`，提示不要改题、原样重试）、`AUDIT_SCRIPT_ERROR`、`AUDIT_CHECKPOINT_FAILED`（退出码 3）。
  "状态 invalid 但判题记录仍 pending" 归为平台故障。成功后打印当前版本与发布命令。
- `qpc upload --write` 写回失败不再让命令失败：上传与审计已成功时只警告并提示手动填写，
  `--json` 输出 `writeBack: ok | failed | skipped`。
- `qpc publish` 发布非当前版本时提前拦下（`NOT_CURRENT_VERSION`），提示当前版本 pid。
- 错误提示与错误信息同走 stderr，不再在管道里乱序。

### Fixed

- JSON 配置（`problem.config.json`）在同一进程内写回后重新加载读到旧内容，导致 `--write`
  写回校验失败并回滚。
- JUD008 不再误报 `page.evaluate` / `$eval` 回调里的 DOM `click()`。

## [1.0.1] - 2026-10-19

### Changed

- 首次通过 CI 自动发布到 npm（`@quantacenter/quanta-problem-cli`，tag 触发，OIDC 免密）。
  无行为变化，仅版本号。

## [1.0.0] - 2026-10-18

### Added

- `qpc init --type <frontend | backend_service>`：按题型生成不同骨架。后端服务题
  （`backend_service`）生成 `type: 'backend_service'` 的配置、用 `http` 断言的后端
  判题脚本、`detail.md` 题面，以及 `template/` / `answer/` 两份可离线安装的 Node
  工程（含 `pnpm-lock.yaml`）；并默认写好 `cover: { mode: 'custom', generate }`
  且**在本地渲染 `cover.png`**（后端没有首屏可截图）。上传换 `imageId` 仍由
  `qpc cover --upload --write` 完成。**不传 `--type` 时用方向键菜单选择**
  （基于 `@clack/prompts`：`↑/↓` 移动、回车确认、Ctrl-C 取消）；
  非交互环境 / `--yes` / `--json` 下不提问，默认 `frontend`，脚本行为与之前一致。
- `qpc upload` 支持在**已有题目下追加新版本**，不再一律新建题目。配置里填上
  `problemId`（`qpc upload` 返回的 pid）后默认走服务端的 `reupload`；
  `--problem <pid>` 临时指定目标，`--new` 强制新建，`--write` 把本次的题目 id
  就地写回配置（写完重新加载校验，对不上就回滚）。未配置 `problemId` 时行为不变。
- `qpc cover --random`：随机生成一套**合理**配色并打印可复现的 `seed`
  （`--seed <n>` 可复现）。「合理」是硬约束而非口彩：主标题对背景 ≥ 7:1、
  强调色对背景 ≥ 4.5:1 对比度；强调色色相按配色关系（同色系 / 邻近色 /
  分裂互补 / 互补 / 三角）从背景色相推导；背景限制在深色 + 中等饱和的窄带。
  颜色优先级为 显式参数 > `--random` > 配置 > 默认值。`--random --write` 会把
  配色一并写进 `cover.generate`（保留 `subtitle`、`out` 等字段）；只 `--upload`
  不改配置。
- 新增 `qpc cover`：从题目配置生成封面图（`cover.generate` 声明配色/尺寸），
  `--upload` 上传后返回 `cover.imageId`，`--write` 直接写回配置文件并在写完后
  重新加载校验（对不上就回滚）。命令行参数（`--bg` / `--bg-to` / `--accent` /
  `--text` / `--subtitle` / `--footer` / `--width` / `--height` / `--out`）
  覆盖配置里的同名项。颜色只收十六进制。
- `cover: { mode: 'custom' }` 的 `imageId` 变为可选，并可携带 `generate`
  配色块：后端题型没有首屏可截图，以前必须去发布页手动传图再抄 id 回配置，
  现在写配色 + 一条命令即可。

## [1.0.0] - 2026-10-07

### Changed

- `qpc login` 默认改为设备码授权（等价于原来的 `qpc login --device`）：
  不带参数直接申请验证码并打开浏览器。密码登录需显式给 `--email` 或
  `--password-stdin`（`QUANTA_EMAIL` / `QUANTA_PASSWORD` 仅作为取值来源，
  不再单独切换流程）。`--show` / `--logout` 行为不变。

### Removed

- 移除 CLI 直连判题调度器的能力：删除全局参数 `--judge`、环境变量
  `QUANTA_JUDGE_URL` 与 `DEFAULT_JUDGE_URL`、`qpc check --judge`、
  `qpc doctor` 的调度器健康检查，以及 `src/services/judge-api.ts`。
  生产环境下调度器无法从出题人机器直连，而判题脚本归一化（`/code/extract`）
  本就由服务端在 `upload` 时完成，CLI 现在只依赖 Web 应用。

### Fixed

- 显式设置的 `--api` / `QUANTA_API_URL` 之前会被凭据文件里记住的地址
  （通常是上次登录的 `http://localhost:3000`）覆盖，导致"设了生产地址却一直
  连本地"。现在优先级为 `--api` > `QUANTA_API_URL` > 凭据文件 > 默认值。

## [0.2.0] - 2026-10-07

### Added

- `qpc login --device`：OAuth 2.0 设备授权流程（RFC 8628）登录。
  申请验证码 → 浏览器授权（页面展示账号/应用/权限并要求显式确认）→ 轮询换 token → 落盘。
  密码不经过 CLI，也不会进 shell history。
- `--no-browser`：只打印验证地址与验证码，便于 SSH / 跳板机 / CI 场景。
- 服务端配套：
  - `POST /api/oauth/device/authorize`、`POST /api/oauth/device/token`；
  - `GET /api/oauth/device/session`、`POST /api/oauth/device/decision`（会话 + CSRF）；
  - 确认页 `app/pages/auth/device`；
  - 端点限速中间件；会话状态存 Redis（多副本部署安全）。
- `@challenge/shared/oauth`：两端共用的协议常量与 `user_code` 归一化函数。
  **两端必须引用同一份实现**，否则会出现"用户输入正确却查不到会话"。

### Security

- `device_code` 为 32 字节随机且**一次性消费**（条件 `del` 保证原子，已有并发测试覆盖）。
- `user_code` 为 base20 × 8 位（约 34.6 bit）；输错 5 次即作废会话（RFC 8628 §5.1）。
- 换到 token 后立即失效；`client_id` 不匹配的请求拿不到会话。
- 批准操作要求登录会话 + CSRF 双提交，且已批准的会话不能被第二个账号改绑。
- 签发前从数据库重新读取角色，避免用授权期间的旧角色签发。

### Notes

- 未实现 loopback 重定向：它无法覆盖 SSH / CI 场景，且需要额外处理端口与
  `127.0.0.1` 指向问题。设备码一种流程即可覆盖全部场景。
- 新增 `vitest.config.ts`：原先没有配置，导致任何 import 服务端源码（Nuxt `~~/` 别名）
  的测试都无法运行。配置里 `include` 刻意逐目录列出，避免顺带纳入一个长期未运行、
  已有 27 个失败的既有 spec（那是独立问题，不该借本次改动变成 CI 红灯）。

## [0.1.0] - 2026-10-07

首个版本：把 `docs/PROBLEM_AUTHORING.md` 的出题流程工具化。

### Added

- `qpc init`：生成题目骨架（`problem.config.ts`、`judge.js`、`template/`、`answer/`、
  `README.md`、`.gitignore`），生成的 judge 脚本与配置**零预检错误、零警告**。
- `qpc check`：离线预检，覆盖判题脚本 return 分数、`page.click` 超时、
  断言消息可读性、`totalScore` 一致性、`initCommand` 与打包目录自洽、
  快照体积/文件数、模板入口页等 24 条规则（见 `docs/RULES.md`）。
  `--judge` 会额外调用调度器 `/code/extract` 做服务端编译验证。
- `qpc upload`：按服务端 `UploadSchema` 构造请求（快照键统一 `/project/...`，
  二进制走 base64），默认轮询审计结果并打印每个检查点的 score/totalScore/details。
- `qpc status <pid>`：查看状态与审计明细，`--watch` 持续刷新。
- `qpc publish <pid>` / `--unpublish`：发布与下架，并在服务端允许的状态外提前拦截。
- `qpc login` / `--show` / `--logout`：凭据存 `~/.config/quanta/credentials.json`（0600），
  access token 过期时自动用 refresh token 续期；支持 `--token` / `QUANTA_TOKEN`（不落盘）。
- `qpc doctor`：自检 Node 版本、凭据权限、API 可达性、登录角色、判题调度器。
- 退出码契约：0 成功、1 运行时错误、2 用法错误、3 预检/审计未通过、
  4 网络或 5xx、5 认证失败、130 中断。
- `--json` 机器可读输出（stdout 仅一份结果 JSON，日志走 stderr）。
- 工程化：biome（lint + format）、tsup（ESM + dts）、vitest（覆盖率阈值 70%）、
  `examples/hello-total` 作为 e2e fixture、CI workflow。

### Notes

- 上传前不做本地 Playwright 预检：真实判题机的执行环境无法在本地等价复现，
  硬凑一套只会带来"本地过了线上挂了"的虚假安全感。线上审计的结果由
  `qpc upload --wait` 完整拉回，本地只负责静态可判定的部分。
