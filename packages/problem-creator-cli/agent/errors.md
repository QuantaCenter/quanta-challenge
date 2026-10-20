# 错误码与下一步动作

`--json` 模式下失败输出 `{ ok: false, error: { name, message, hint, details, exitCode } }`；`details.code` 为下表错误码，`details.retryable` 表示能否原样重试。

## 退出码

| 退出码 | 含义 | 该做什么 |
| --- | --- | --- |
| 0 | 成功 | — |
| 1 | 未分类错误 | 看 message / hint；加 `--verbose` 看堆栈 |
| 2 | 用法 / 配置错误 | 改命令参数或配置（`qpc agent config`） |
| 3 | 题目不合格（预检、本地判题或线上审核未通过） | **改题目**，然后重跑 `qpc check` |
| 4 | 网络 / 平台故障 | **不要改题目**，稍后原样重试 |
| 5 | 未登录 / 令牌失效 / 无权限 | `qpc login --api <url>`（需要人在浏览器确认） |

## 上传与发布

| 错误码 | 含义 | 下一步 |
| --- | --- | --- |
| `AUDIT_CHECKPOINT_FAILED` | 线上审核时参考解没拿满分 | 看输出里 ✖ 的检查点原因 → 修 judge.js / answer/ → `qpc check` 本地满分 → `qpc upload --write` |
| `AUDIT_SCRIPT_ERROR` | 判题脚本整体失败（超时、语法错误、用了沙箱里没有的全局） | 同上，先用 `qpc check` 复现 |
| `AUDIT_INFRA_ERROR` | 平台侧故障（审计任务丢失、判题机崩溃、数据库竞态），与题目无关 | 原样重跑 `qpc upload --write`，最多 3 次；仍失败联系平台管理员 |
| `NOT_CURRENT_VERSION` | 发布的不是当前版本 | 用错误提示里的当前版本 pid：`qpc publish <currentPid>` |
| 审计超时 | 180 秒内没出结果 | `qpc status <pid> --watch` 继续等；长时间无结果按平台故障处理 |
| 写回失败（警告） | 上传已成功，只是 problemId 没写回配置 | **不要重传**，手动把 `problemId` 填进配置 |

## 预检 / 本地判题

规则号（JUD / CFG / RUN / IMG / TPL / ANS / SNAP / LOC）见 `qpc agent check`，每条输出下面的缩进行就是修复建议。

## 其它

| 现象 | 原因 | 做法 |
| --- | --- | --- |
| `题目配置校验失败` | 字段缺失或类型不对 | 按错误里列出的字段路径修正（`qpc agent config`） |
| `当前不是交互式终端，无法多选` | 在非 TTY 用了 `qpc tag --write` | 改用 `qpc tag --write 2,5` |
| `找不到可用的无头浏览器` | 本机没有 Chromium / Chrome / Edge | `npx playwright@1.54.1 install chromium` |
| `尚未登录` | 没有凭据 | `qpc login --api <url>` |
