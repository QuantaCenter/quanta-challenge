# {{title}}

本目录由 `qpc init` 生成，包含出题所需的全部文件。

## 目录结构

```
problem.config.ts   题目配置（标题、难度、标签、运行命令）
judge.js            判题脚本（真源；判分逻辑都在这里）
template/           答案模板：学生从这里开始，通常拿低分
answer/             参考解：必须拿满分，首屏截图会当作封面
```

## 标准流程

```bash
qpc agent              # 判题脚本编写手册（先读）
qpc tag --write <ids>  # 指定标签
qpc check              # 基础信息检查 + 本地微判题（answer 满分、template 低分）
qpc upload --write     # 上传审核（约 20 秒），成功后写回 problemId
qpc publish <pid>      # 发布 upload 输出的当前版本
```

题面插图：`qpc gen-img screenshot` / `qpc gen-img flow ...` 生成到 `images/`，写进题面后 `qpc image --write`。

## 需要人工确认的事（检查覆盖不到）

- [ ] 同一需求的多种合理写法都能满分（判结果，不判实现）
- [ ] 断言消息写清"期望 vs 实际"（预检只做启发式提醒）
- [ ] 封面好看（默认封面 = 参考解首屏截图，可用 `qpc gen-img screenshot` 预览）

完整手册：`qpc agent --list`。
