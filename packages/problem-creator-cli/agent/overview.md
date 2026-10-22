# qpc 是什么

`qpc` 是 Quanta Challenge 平台的**出题 CLI**。它把一道题从零到上线的全过程收进命令行：

```
生成骨架 → 写题面 / 模板 / 参考解 / 判题脚本 → 配标签、插图、封面
        → 本地检查（静态预检 + 本地微判题）→ 上传审核 → 发布
```

一道题 = 一个目录：

```
problem.config.ts   题目配置：标题、题型、难度、标签、封面、运行命令、problemId
detail.md / detail  题面（Markdown，原样展示给学生）
template/           答案模板：学生的起点，应当拿低分
answer/             参考解：必须拿满分（线上审核就是用它跑判题脚本）
judge.js            判题脚本：定义检查点、断言、给分
images/             题面插图（qpc gen-img 生成，qpc image 上传）
AGENTS.md           给 Agent 的入口说明
```

## 两种题型

| 题型 | 学生写什么 | 判题方式 | 判题脚本拿到的对象 |
| --- | --- | --- | --- |
| `frontend` | 静态网页（HTML/CSS/JS） | 静态服务器起站点 + Playwright 打开页面 | `page`（去掉 `goto` 的 Playwright Page）+ `$` |
| `backend_service` | Node.js HTTP 服务 | 容器里 `npm start` 起服务 + 发 HTTP 请求 | `http`（受限 HTTP 客户端）+ `$` |

## 命令一览

| 命令 | 作用 | 需要登录 |
| --- | --- | --- |
| `qpc agent [topic]` | 本手册；`--list` 列出章节 | 否 |
| `qpc login --api <url>` | 登录（设备码，需要人在浏览器里点确认） | — |
| `qpc init [dir] --type <t>` | 生成题目骨架（含 AGENTS.md） | 否 |
| `qpc tag [--write <ids>]` | 查看标签 / 写回 tagIds | 否 |
| `qpc snapshot-image [--write <id>]` | 查看快照镜像 / 写回 snapshotImageId（启动命令的依赖在镜像里时必填） | 是 |
| `qpc gen-img flow\|svg\|screenshot` | 生成题面插图到 images/ | 否 |
| `qpc image [--write]` | 上传题面里的本地图片并回写地址 | 是 |
| `qpc cover --write` | 生成封面、上传、写回 imageId（后端题必做） | 是 |
| `qpc check [--strict]` | ① 基础信息静态预检 ② 本地微判题 | 否 |
| `qpc upload --write` | 上传并等待线上审核，成功后把 pid 写回配置 | 是 |
| `qpc status <pid>` | 查看某版本的审核结果 | 是 |
| `qpc publish <pid>` | 发布（只能发布当前版本） | 是 |
| `qpc doctor` | 环境自检 | 否 |

## 给 Agent 的约定

- 加 `--json`：stdout 只有一份 JSON 结果，日志走 stderr。失败时 JSON 里有 `error.details.code`（错误码）、`retryable`、`nextAction`。
- 加 `--yes`：跳过所有确认；非交互环境不会弹多选（`qpc tag` 请用 `--write 2,5`、`qpc snapshot-image` 请用 `--write <id>` 直接给 id）。
- 退出码：`0` 成功，`1` 未分类错误，`2` 用法/配置错误，`3` 题目不合格（要改题），`4` 网络/平台故障（可重试），`5` 未登录/无权限。
- 每个报错下面都有提示行（hint），照做即可；对照表见 `qpc agent errors`。

## 继续阅读

- `qpc agent workflow`：出题流程，每步的命令和验收条件
- 在题目目录里运行 `qpc agent`：判题脚本编写手册（前端 / 后端 / Type Schema）
