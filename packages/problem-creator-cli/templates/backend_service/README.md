# {{title}}

本目录由 `qpc init --type backend_service` 生成：一道**后端服务题**的骨架。
判题机不发浏览器请求，而是把参考答案跑起来、向它发 HTTP 请求做断言。

## 目录结构

```
problem.config.ts   题目配置（题型、镜像、端口、启动命令）
detail.md           题面（Markdown，原样展示给学生）
judge.js            判题脚本（用 http 发请求、断言响应）
template/           答案模板：学生起点（含 pnpm-lock.yaml）
answer/             参考解：必须拿满分（含 pnpm-lock.yaml）
cover.png           init 已按 cover.generate 渲染好的封面（还没上传）
```

## 标准流程

```bash
qpc agent              # 判题脚本编写手册（先读）
qpc tag --write <ids>  # 指定标签
qpc cover --write      # 后端题必须自定义封面：生成 → 上传 → 把 imageId 写回配置
qpc check              # 基础信息检查 + 本地微判题（在 answer/、template/ 里 npm start 后跑判题脚本）
qpc upload --write     # 上传审核（约 20 秒），成功后写回 problemId
qpc publish <pid>      # 发布 upload 输出的当前版本
```

> `qpc cover --write` 之前 `qpc check` 会报 IMG001（custom 封面缺 imageId），这是预期的：
> 后端题没有首屏可截图，封面只能先生成再上传。

## 加依赖

`template/` 与 `answer/` 是两份独立工程（学生改 template，判分跑 answer）。
加了依赖要同步两边，并在**对应目录**重新生成锁文件——容器是断网离线安装，
没有锁文件或者锁文件与 package.json 对不上都会起不来：

```bash
cd answer   && pnpm add express   # 同时更新 package.json 与 pnpm-lock.yaml
cd ../template && pnpm add express
```

## 需要人工确认的事（预检覆盖不到）

- [ ] 参考解真的能拿满分（看 `qpc upload --wait` 的检查点明细）
- [ ] 答案模板明显低分（证明判题能抓错）
- [ ] `initCommand` 指向的入口能启动，服务监听 `servicePort`（默认 3000）
- [ ] 封面好看（后端题用的是 `cover.png` 生成的图，不是截图）

完整链路与镜像约定见仓库 `docs/BACKEND_SERVICE_PROBLEM.md`；
出题踩坑清单见 `docs/PROBLEM_AUTHORING.md`。
