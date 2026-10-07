# 架构与设计取舍

## 一、它解决什么问题

`docs/PROBLEM_AUTHORING.md` 记录的真实耗时是"上传到审计完成约 20 秒，
端到端提交到出分 3.5 秒"，而踩坑成本几乎都花在**等审计才发现脚本写错**上。
本工具把可以离线判定的错误提前到毫秒级，把只能在线上判定的（参考解是否满分）
用一次 `--wait` 明确展示。

## 二、分层

```
commands ──▶ domain      （纯业务规则，无 IO 之外依赖）
    │    └─▶ services    （HTTP / tRPC / 凭据 / judge）
    └──────▶ ui          （渲染报告：人类可读 + JSON）
                │
core（context / logger / errors / runtime / env）与 utils 被所有层使用
```

硬性约束：

1. **`domain` 不 import `services`。** 预检规则、判题脚本分析、快照都能在
   "没有网络、没有登录"的情况下测试与复用。
2. **`commands` 不拼 URL、不读 `process.env`。** URL 在 `services` 里，
   环境变量在 `core/env.ts` 里。命令只做编排与输出，因此
   `tests/unit/commands-*.test.ts` 可以用假 fetch 跑完整流程。
3. **只有 `src/index.ts` 有副作用**（装信号处理、写 `process.exitCode`）。
   `cli.ts` 返回退出码而不是 `process.exit()`，测试才能在同一进程里反复调用。
4. **`program.ts` 与 `index.ts` 分离。** `problem.config.ts` 会
   `import { defineProblemConfig } from '@challenge/problem-creator-cli'`，
   而 CLI 用 jiti 加载配置模块；两者若同文件，加载配置就会把 CLI 跑一遍。

## 三、一次 `qpc upload` 的数据流

```
problem.config.ts ─┐
judge.js ──────────┤
template/ ─────────┼─▶ loadProblemConfig ─▶ validateProblem ─┬─▶ findings（渲染 / 退出码）
answer/ ───────────┘                                          │
                                                              ├─▶ templateSnapshot  {}  → answerTemplateSnapshot
                                                              └─▶ answerSnapshot    {}  → referenceAnswerSnapshot

POST /api/trpc/admin.problem.upload  （裸 input → {result:{data}}）
        │                                  服务端会再调调度器 /code/extract 归一化脚本
        ▼
   problemId + 审计任务入队
        ▼
GET /api/trpc/admin.problem.getAuditDetail 轮询
        ▼
   judgeRecord.result ≠ pending → 打印每个检查点 score/totalScore/details
        ▼
   score === totalScore ？ → 退出 0 / 3（并提示 qpc publish）
```

关键约定（都来自服务端实现，改动时要同步）：

- tRPC 走**非批量** `httpLink` 协议：`POST /api/trpc/<path>`，body 是**裸 input**，
  响应是 `{result:{data}}`（仓库未启用 transformer，因此没有 `json` 包装层）。
- 查询用 `GET ...?input=<urlencoded json>`。
- 会话鉴权同时要 cookie（`quanta_access_token` / `quanta_csrf_token`）
  与请求头 `x-csrf-token`；只有 access token 时退回 `x-ssr: 1`
  （与 `packages/challenge-web-app/scripts/smoke-test.mjs` 同一通道）。
- access token 15 分钟过期，401 时用 refresh token 调 `GET /api/refresh` 续期一次后重试。

## 四、判题脚本为什么用"打码 + 括号配对"而不是真解析器

需求只有四个：找 `defineCheckPoint` 调用、读它的名称/分值、判断 handler 有没有
`return` 值、找 `click` 是否带 `timeout`。为此引入 TypeScript/Babel 解析器
会把 CLI 的体积与安装成本抬上一个量级，而收益只是"极少数写法差异"。

所以实现是：

1. `maskNonCode`：把注释、字符串、模板串、正则（用"前一个非空字符"启发式判定）
   整体替换成空格，得到等长 mask（保留换行，行号不变）。
2. 在 mask 上做 `indexOf` + 括号配对找调用点（不会字符串里的括号带偏）。
3. 需要真实内容时，用**相同下标**从原串切片，再解析字符串/数字字面量。

已知边界（写在这里而不是假装没有）：跨行正则里含未配对括号的极端写法、
动态生成的判题脚本无法分析。这两类问题都能被服务端的 `/code/extract` 兜住，
所以 `qpc check --judge` 提供"真的让调度器编译一次"的选项。

## 四点五、登录方式：为什么是设备码

`qpc` 有三种登录途径，各有明确的适用面：

| 方式 | 密码经过 CLI | 适用 |
|---|---|---|
| `login --device` | 否 | 默认推荐；本机、SSH、CI 都能用 |
| `login`（邮箱密码） | 是 | 没有浏览器、且不想用管道传密码时 |
| `QUANTA_TOKEN` | 否 | 一次性脚本/自动化 |

设备码选型的关键论证在 `docs/OAUTH_DEVICE_FLOW.md`，核心是：
RFC 8252 推荐的 loopback 重定向要求浏览器与 CLI 在**同一台机器**上
（`127.0.0.1` 的语义），这在 SSH 与 CI 场景直接失效；设备码没有这个约束。

实现上刻意**没有**引入 OAuth 库：全流程只有两个端点加一个页面，
真正的安全属性来自"高熵 + 一次性 + 限速 + 显式确认"这四件事，
它们都需要按本仓库的存储（Redis）与鉴权（cookie + CSRF）习惯来写，
套库反而要在集成层再包一遍。协议常量与归一化函数放在 `@challenge/shared/oauth`，
由服务端、确认页、CLI 三方共用 —— 这是避免"两端规则漂移"的唯一可靠办法。

## 五、其它取舍

| 选择 | 原因 |
|---|---|
| 快照在本地就按 `/project/...` 组装 | 键格式是线上最隐蔽的坑（少了前缀判题机找不到站点根），本地就该定型 |
| 二进制按 base64 | 与 WebContainer 提交链路一致（`acceptedBinaryExtensions`），按 utf8 读会静默损坏图片 |
| `examples/hello-total` 由 `qpc init` 生成并提交 | 它既是文档也是 e2e fixture：脚手架一旦和预检规则冲突，测试立刻红 |
| 退出码细分到 3/4/5 | CI 需要区分"题目不合格"和"服务没起来"，都返回 1 会浪费排查时间 |
| 不引入 prompts/mock 库 | 交互只有"隐藏输入"和"确认"两个，`node:readline` 足够；假 fetch 比 mock 库更能锁定协议细节 |
| 环境变量里的令牌不落盘 | 构建机上留下长期有效的令牌是真实的安全问题 |

## 六、扩展点

- 新规则：`domain/validate.ts` + `docs/RULES.md` + 测试（见 RULES.md 末节）。
- 新命令：`commands/<name>.ts` 导出 `registerXCommand(registry)`，
  在 `commands/index.ts` 里注册。命令只做编排，逻辑放 domain/services。
- 新的服务端接口：`services/admin-api.ts` 加一个方法即可，
  命令里不出现 URL 字符串。
- 需要交互时：`utils/terminal.ts` 里的 `promptVisible` / `promptHidden` / `confirm`。
