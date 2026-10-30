# 出题流程

每一步都写了**验收条件**：没达到就不要进入下一步。

## 0. 登录（每台机器一次）

```bash
qpc login --api https://challenge.quantacenter.com
```

设备码授权：命令会打印一个网址和验证码，**需要人在浏览器里确认**。Agent 应把网址转告用户并等待命令返回。
验收：`qpc login --show` 显示已登录且角色是管理员。

## 1. 新建题目目录并初始化

```bash
qpc init my-problem --type frontend --name "购物车合计" --difficulty easy --yes
# 后端题：--type backend_service
cd my-problem
```

难度：`easy | medium | hard | very_hard`。总分（`totalScore`，即各检查点之和）按难度取值：

| difficulty | totalScore |
| --- | --- |
| `easy` | 50 ~ 80 |
| `medium` | 100 ~ 150 |
| `hard` | 200 起，上不封顶 |
| `very_hard` | 200 起，上不封顶 |

验收：目录里有 `problem.config.ts`、`judge.js`、`template/`、`answer/`、`AGENTS.md`。

## 2. 阅读脚本编写手册

```bash
qpc agent            # 在题目目录里运行：判题脚本编写手册（前端 / 后端 / Type Schema）
qpc agent config     # 配置字段
```

## 3. 出题：写题面、模板、参考解、判题脚本

- 题面：写清"学生要做什么"和每个检查点关注的行为。题面里写的**每个可观察要求**，判题脚本都要能验证；判题脚本验证的每件事，题面里都要写明。
- `answer/`：完整实现，必须满分。
- `template/`：保留结构与 TODO，学生从这里开始，应当明显低分。
  - **一个 TODO 一个块**：每条待办单独一行注释，放在它要改的代码位置旁边，下面留空行给学生作答；不要把全部步骤塞进一个多行注释块里，学生不该再自己拆分步骤。

  ```js
  // TODO 1: 点击 #inc 时让 #count 加一

  // TODO 2: 计数达到 3 时让 #tip 显示"已达标"

  // TODO 3: 计数为 0 时禁用 #reset
  ```
- `judge.js`：见 `qpc agent judge-frontend` / `qpc agent judge-backend`。

## 4. 指定标签

```bash
qpc tag                 # 查看全部标签及说明
qpc tag --write 2,5     # 直接写回 tagIds（交互终端可只写 --write 多选）
```

验收：配置里 `tagIds` 是平台上存在的 id。

快照镜像：先看启动命令（`runtime.initCommand`）用到的工具或依赖（如 `vite`）是否已包含在某个快照镜像里（`qpc snapshot-image` 看名称和备注）。有就要填：做题页的 Vivari 会直接挂载镜像里的依赖，不用每次现场下载，启动更快。都不包含就不填。快照镜像不参与判题。

```bash
qpc snapshot-image                  # 查看平台快照镜像（需登录）
qpc snapshot-image --write <id>     # 写回 snapshotImageId（交互终端可只写 --write 单选；none = 不使用）
```

## 5. 题面插图

```bash
qpc gen-img flow "浏览器" "POST /items" "服务端校验" "201 Created"   # 流程图
qpc gen-img screenshot --target answer                              # 前端：参考解效果图
qpc gen-img svg ./sketch.svg                                        # 手写 SVG 转 PNG
qpc gen-img record --cursor hover:.card click:.btn                  # 前端：参考解动效录成 GIF
```

把命令输出的 `![...](images/xxx.png)` 写进题面，然后：

```bash
qpc image --write       # 上传题面里引用的本地图片，并把地址回写成 /api/static/<id>.png
```

验收：`qpc check` 没有 IMG003。详见 `qpc agent images`。

## 6. 封面

- 前端题：默认封面 = 参考解首屏截图，无需操作（首屏应好看、稳定，不要是空白或加载态）。
- 后端题：**必须**自定义封面：

```bash
qpc cover --write       # 生成 cover.png → 上传 → 把 imageId 写回配置
```

验收：`qpc check` 没有 IMG001 / IMG002。

## 7. 检查

```bash
qpc check
```

1. **基础信息**：配置字段、题面、图片、判题脚本静态规则、快照体积等。
2. **本地微判题**：在与线上同构的沙箱里，对 `answer/` 和 `template/` 各跑一遍判题脚本。

验收：退出码 0；输出 "参考解本地满分"；模板明显低分；耗时远小于 20 秒。
本地微判题需要无头浏览器（前端题）或已安装依赖（后端题有第三方依赖时），缺失时会提示如何安装。

## 8. 上传审核

```bash
qpc upload --write
```

上传后平台用参考解跑一遍判题脚本（约 20 秒），要求 `得分 == totalScore`。成功后 pid 写回配置的 `problemId`，之后再上传会在同一道题下追加新版本。

审核不通过时看错误码（`--json` 里的 `error.details.code`）：

| 错误码 | 含义 | 怎么做 |
| --- | --- | --- |
| `AUDIT_CHECKPOINT_FAILED` | 参考解没拿满分 | 看 ✖ 检查点的原因，修 judge.js 或 answer/ → `qpc check` 本地满分 → 再 `qpc upload --write` |
| `AUDIT_SCRIPT_ERROR` | 判题脚本整体失败 | 同上，先用 `qpc check` 复现 |
| `AUDIT_INFRA_ERROR` | 平台故障，与题目无关 | **不要改题**，原样重跑 `qpc upload --write`（最多 3 次） |

验收：输出 "审计通过"，并显示 "当前版本：#<pid>"。

## 9. 发布

```bash
qpc publish <pid>      # 用 upload 最后输出的"当前版本" pid
```

只有当前版本（最新一次上传）且状态为 `ready` 才能发布。
