# {{title}}（后端服务题）

这是一道 Quanta Challenge 后端服务题的工作目录，由 `qpc init --type backend_service` 生成。

开始之前先运行：

```bash
qpc agent            # 判题脚本编写手册（后端章节在最前）
qpc agent workflow   # 出题流程，每步的命令与验收条件
```

关键约束（详见手册）：

- `answer/` 必须拿满分，`template/` 应明显低分；`qpc check` 会在本地 `npm start` 后真实跑一遍判题脚本验证。
- 服务必须监听 `process.env.PORT`；加依赖后在 `answer/`、`template/` 各自 `pnpm install`，保持锁文件一致。
- 判题脚本总预算 20 秒；检查点串行执行、共用同一个服务进程；每个检查点都要 `return` 分数。
- 必须自定义封面：`qpc cover --write`。
- 上传用 `qpc upload --write`；报 `AUDIT_INFRA_ERROR` 时不要改题，原样重试。
