# qpc check：基础信息检查 + 本地微判题

```bash
qpc check              # 两步都跑
qpc check --no-run     # 只做第 1 步
qpc check --strict     # 警告也算失败
qpc check --json       # 机读结果（含 localJudge 明细）
```

## ① 基础信息（静态，毫秒级）

| 规则 | 级别 | 含义 |
| --- | --- | --- |
| JUD001~003 | 错误 | 判题脚本不存在 / 缺 `export default` / 没调用 `defineTestHandler` |
| JUD004 | 错误 | 检查点 handler 没有 `return` 分数 |
| JUD005~007 | 警告 | 分值 ≤ 0 / 分值不是字面量 / 检查点重名 |
| JUD008 | 警告 | `page.click` 没设 timeout（evaluate 回调里的 DOM click 不算） |
| JUD009 | 提示 | 断言消息没有"期望 vs 实际" |
| JUD010~011 | 警告 | 没有任何 `$.expect` / 存在 default 之外的导出 |
| CFG001 | 错误 | `totalScore` 与检查点之和不一致 |
| RUN001~003 | 警告/错误 | 站点根不等于上传目录 / bootCommand 会被覆盖 / 后端缺锁文件 |
| IMG001~002 | 错误 | custom 封面缺 imageId / 后端题没用自定义封面 |
| IMG003 | 错误 | 题面引用了本地图片（`qpc image --write`） |
| TPL / ANS / SNAP | 错误 | 模板或参考解缺失、为空、缺 index.html、体积/文件数超限 |

## ② 本地微判题

在与线上判题机同构的沙箱里（同样的 `defineTestHandler` / `$` / 去掉 goto 的 `page` / 受限 `http`、同样的 20 秒预算、同样没有 `setTimeout`），对 `answer/` 和 `template/` 各跑一遍：

- 前端：本地静态服务器以目录为站点根，无头 Chromium 1280×720 打开页面后执行脚本。
- 后端：在目录里 `npm start`（注入 `PORT` / `QUANTA_PORT`，优先用 `servicePort`），等端口可连后执行脚本。

| 规则 | 级别 | 含义 → 做法 |
| --- | --- | --- |
| LOC001 | 错误 | 参考解运行时脚本整体失败 → 看原因（超时、页面/服务没起来、用了沙箱没有的全局） |
| LOC002 | 错误 | 参考解没拿满分 → 按 ✖ 检查点原因修 judge.js 或 answer/ |
| LOC003 | 警告 | 模板也拿满分 → 判题抓不到错，补 TODO 或加强检查点 |
| LOC004 | 警告 | 参考解耗时超过 15 秒 → 线上更慢，减少等待 |
| LOC005 | 警告 | 环境不满足而跳过（没有浏览器 / 后端依赖未安装）→ 按提示安装后重跑 |

无头浏览器按顺序尝试：Playwright 自带 Chromium → 本机 Chrome → 本机 Edge。都没有时执行 `npx playwright@1.54.1 install chromium`。

本地满分不等于线上一定满分（线上机器更慢、字体不同），但本地不满分线上一定不满分。
