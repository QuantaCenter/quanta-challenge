# {{title}}（前端题）

这是一道 Quanta Challenge 前端题的工作目录，由 `qpc init` 生成。

开始之前先运行：

```bash
qpc agent            # 判题脚本编写手册（前端 / 后端 / Type Schema）
qpc agent workflow   # 出题流程，每步的命令与验收条件
```

关键约束（详见手册）：

- `answer/` 必须拿满分，`template/` 应明显低分；`qpc check` 会在本地真实跑一遍判题脚本验证。
- 判题脚本总预算 20 秒，超时所有检查点作废；沙箱里没有 `setTimeout` / `fetch`，`page` 没有 `goto`。
- 每个检查点都要 `return` 分数；断言消息写清"期望 vs 实际"。
- 题面里的图片要用 `qpc image --write` 换成平台地址。
- 上传用 `qpc upload --write`；报 `AUDIT_INFRA_ERROR` 时不要改题，原样重试。
