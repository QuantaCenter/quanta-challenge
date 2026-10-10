# 预检规则表

`qpc check` 输出的每条诊断都带规则号。**规则号是稳定契约**：
CI 的豁免清单、文档、issue 都按编号引用，新增规则只能追加编号，不重排、不复用。

严重级别：

- `error` —— 线上一定出问题（或判 0 分），必须修，`qpc upload` 会直接拒绝。
- `warn` —— 大概率出问题或体验差，默认不阻塞（`--strict` 时阻塞）。
- `info` —— 提醒，不阻塞。

## 判题脚本（JUD）

| 规则 | 级别 | 触发条件 | 为什么 |
|---|---|---|---|
| JUD001 | error | 未找到判题脚本文件 | `paths.judge` 指向的文件不存在 |
| JUD002 | error | 缺少 `export default defineTestHandler(...)` | 判题机把文本 `export default ` 替换成 `const run = `；裸函数声明不会生效 |
| JUD003 | error | 没有调用 `defineTestHandler` | 同上，脚本执行时拿不到测试入口 |
| JUD004 | error | 检查点 handler 没有 `return` 分数 | `score = successScore ?? 0`：断言全过也会记 0 分（最高频的坑） |
| JUD005 | warn | 检查点分值 ≤ 0 | 通常是笔误；0 分检查点没有判分意义 |
| JUD006 | warn | 检查点分值不是数字字面量 | 本地无法累加校验，线上 `totalScore` 很可能对不上 |
| JUD007 | warn | 检查点名称重复 | 判题详情里无法区分同名检查点 |
| JUD008 | warn | `xxx.click(...)` 未设置 `timeout` | 目标是 disabled 按钮时 Playwright 会重试到 30 秒超时 |
| JUD009 | info | `$.expect` 的消息里既没有实际值也没有"期望/实际" | 消息会原样展示给学生，看不懂等于没提示 |
| JUD010 | warn | 脚本里没有任何 `$.expect` | 没有断言的判题等于白送分 |
| JUD011 | warn | 存在 `default` 之外的导出 | 模块替换后残留绑定，行为不可预期 |

## 配置（CFG）

| 规则 | 级别 | 触发条件 | 为什么 |
|---|---|---|---|
| CFG001 | error | `totalScore` ≠ 各检查点分值之和 | 审计通过的条件是 `score === totalScore`，不等就线上失败 |
| CFG002 | info | 未指定 `totalScore` | 提示将采用检查点之和 |

## 运行期（RUN / IMG）

| 规则 | 级别 | 触发条件 | 为什么 |
|---|---|---|---|
| RUN001 | warn | `initCommand` 里没有出现 `judgeUploadPath` | 站点根必须等于打包目录，否则判题机在错误目录找 `index.html` 直到超时 |
| RUN002 | warn | 没有配置 `buildCommand` | 在线编辑器点「提交」时会先跑它；为空时编辑器侧直接 return，表现是「点了提交什么都没发生」。静态题也写 `echo built` |
| IMG001 | error | `cover.mode = 'custom'` 但没给 `imageId` | 服务端 schema 会拒绝，属于"提交前就能发现"的错误 |

## 工程快照（TPL / ANS / SNAP）

| 规则 | 级别 | 触发条件 | 为什么 |
|---|---|---|---|
| TPL001 | error | 答案模板目录不存在 | 学生没有起点工程 |
| TPL002 | error | 答案模板目录为空 | 同上 |
| TPL003 | error | 答案模板里没有 `index.html` | 静态服务器根目录必须有入口页，否则判题一直等选择器 |
| ANS001 | error | 参考解目录不存在 | 审计没有可跑的答案，也拿不到封面 |
| ANS002 | error | 参考解目录为空 | 同上 |
| SNAP001 | error | 快照体积超过上限（默认 5 MiB，`QUANTA_MAX_UPLOAD_BYTES`） | 多半把 `dist/`、`node_modules/` 或大图打进去了 |
| SNAP002 | error | 快照文件数超过 500 | 同上 |
| SNAP003 | info | 跳过了 `node_modules/` / `dist/` 等条目 | 让"我明明放了文件却没上传"变可见 |

## 加一条规则要改什么

1. `src/domain/validate.ts` 里新增判定，填满 `rule / severity / message / file / line / hint`。
2. 本文件加一行（编号递增）。
3. `tests/unit/validate.test.ts` 加一个"能触发 / 不误报"的用例。

`message` 要写清"是什么坏了"，`hint` 要写清"怎么修"——
`qpc check` 是出题人唯一的本地反馈渠道，含糊等于没报。
