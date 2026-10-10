# problems/ —— 已发布的题目

这个目录里的每道题都由 `qpc init` 生成骨架、改成本题内容后用 `qpc` 上传与发布
（**不是**手写数据库）。当前有两道已发布、被学习内容里的文章引用，另有一道待上传：

| 目录 | 题目 | 难度 | 总分 | baseId / 当前 pid | 构建命令 | 学习内容里出现在 |
|---|---|---|---|---|---|---|
| `cart-total/` | 购物车合计 | easy | 40 | `6` / `8` | `echo built` | 语义化标签、flex 布局、节点操作 |
| `theme-switch/` | 主题切换 | medium | 40 | `7` / `9` | `echo built` | 表单与可访问性、自定义属性、本地存储 |
| `external-link/` | 站外链接 | easy | 40 | 待上传 | `echo built` | 暂未引用 |

`baseId` 是「题号」，文章正文里写 `<Problem baseId={6} />` 引用的就是它；
`pid` 是版本号（`qpc publish` 的参数）。两者在 `packages/challenge-web-app/app/composables/learning-content.ts`
的 `PROBLEM_REGISTRY` 里登记——文章只写 baseId，标题 / 难度 / 分值由这张表补全。

## 复现流程

```bash
# 0. 依赖：PostgreSQL + Redis（docker），判题调度器（端口 1888）必须已启动，
#    否则 admin.problem.upload 会因为连不上判题机直接 500。

# 1. 认证（设备码默认；CI 用密码走 stdin）
qpc login --email <管理员邮箱> --password-stdin <<< '<密码>'

# 2. 本地预检（--strict 让警告也阻塞）
qpc check problems/cart-total --strict

# 3. 上传并等待审计（默认就等；不要写 --wait，没有这个参数）
qpc upload problems/cart-total

# 4. 审计通过（status=ready、score=totalScore）后发布
qpc publish <pid>

# 5. 改了配置要重发一版：用 --base 挂在原题号上（题号不变，文章的 baseId 引用不用改）
#    不要直接再 qpc upload：那会新建一道题（新 baseId），引用它的文章就指错了
qpc upload problems/cart-total --base 6
qpc publish <新 pid>
```

## 改了配置怎么重发：`qpc upload --base <题号>`

题目配置（`problem.config.ts`）是**上传时冻结进版本**的，所以改完必须重发一版才会生效。
重发要用 `--base`（走 `admin.problem.reupload`），否则 `qpc upload` 会新建一道题：
新题号、新 pid，而文章引用的是 `baseId`，会指向那道没改过的旧题。

本次就是这么把 `buildCommand` 补上去的：

```bash
qpc upload problems/cart-total --base 6   # → pid 8，题号仍是 6，审计 40/40
qpc publish 8
qpc upload problems/theme-switch --base 7 # → pid 9，题号仍是 7，审计 40/40
qpc publish 9
```

重发后要把 `packages/challenge-web-app/app/composables/learning-content.ts` 里
`PROBLEM_REGISTRY` 的 `pid` 更新成新的版本号（`baseId` 不动）：它就是文章页「去做题」
跳转用的 `/challenge/editor/<pid>`，指向旧版本会打开一个没有 `buildCommand` 的版本。

## `runtime.buildCommand` 必须有（本次踩到）

两道题都是纯静态页面、没有构建步骤，所以最初**没写** `buildCommand`，
结果在在线编辑器里点「提交」**毫无反应**。原因是编辑器侧的提交流程：

```
packages/challenge-web-app/app/pages/challenge/_subpages/editor/_components/CommitModal.vue
   if (isCommitting.value || !props.buildCommand || !props.uploadDir) return;   // ← 直接 return
```

`buildCommand` 为空时，提交（构建 → 打包 → 上传）整条链路根本不会开始，
而且不报错、没有提示，非常难定位。所以**没有构建步骤也要给一条**：

```ts
runtime: {
   judgeUploadPath: 'project',
   initCommand: 'npx serve -l 3000 project',
   // 编辑器点「提交」时会先跑它，退出码非 0 即失败；静态题给一条必定成功的空操作
   buildCommand: 'echo built',
}
```

已落地的地方：

- `problems/cart-total/problem.config.ts`、`problems/theme-switch/problem.config.ts` 都补上了；
- `qpc init` 生成的脚手架默认带 `buildCommand: 'echo built'`，新题不会再漏；
- `qpc check` 新增 **RUN002**（warn）：没配 `buildCommand` 就提醒，
  否则只能到编辑器里点一次才知道（见 `packages/problem-creator-cli/docs/RULES.md`）；
- `qpc upload` 的内容摘要现在会打印「构建命令」，`--dry-run` 就能核对。

## 出题时踩到、并已修掉的两个 CLI 坑

1. **`login` 写下的凭据会让后续命令全部读不出来**（已修）
   `credentials.json` 里的 `user.email` 会是 `null`（用户名登录的账号没有邮箱），而
   `credentialsSchema` 只写了 `.optional()`，`null` 不合法。症状是 `qpc login` 一切正常，
   **下一条命令**却报「凭据文件结构无法识别」。
   修法：`nickname` / `email` 改成 `.nullish()`，并补了 `tests/unit/credentials.test.ts` 回归用例。

2. **`export default ` 出现在注释里，判题机会替换错地方**（源码已修，需重建镜像）
   判题机原先用 `String.replace('export default ', 'const run = ')` 做转换，只替换**第一处**。
   脚手架模板的注释里恰好写了这个词，于是真正的 `export default` 留在源码里，vm2 报
   `'import' and 'export' may appear only with 'sourceType: module'`，审计分数恒为 0。
   修法：`packages/challenge-agents/judge-machine/src/services/judge.ts` 改用
   `/^[ \t]*export\s+default\s+/m`（只认行首），脚手架注释也换掉了这个字面量，
   并补了「生成物的注释里不得出现该字面量」的断言。
   ⚠️ 判题机跑在 `challenge-judge-machine-agent` 镜像里，改完**要重建镜像**：
   `docker build -t challenge-judge-machine-agent -f packages/challenge-agents/judge-machine/Dockerfile .`
   （本机 Docker BuildKit 因沙箱权限报 `failed to update builder last activity time`，
   用 `DOCKER_BUILDKIT=0 docker build ...` 可以正常构建。）

## 另一条踩过的坑（判题脚本侧，与 CLI 无关）

Playwright 的 CSS 引擎里 `input[name="keyboard"]` 的引号是**字面量**，永远匹配不到；
必须写 `input[name=keyboard]`。写错的表现是每个检查点等满 10s 默认超时，
整体超过调度器的 30s 上限，最终只看到一句 `Judge Machine response timeout`。
两道题的判题脚本都在开头把默认超时收到 3s，让这类错误变成一条可读的失败原因。
