# @challenge/live-server-agent（前端题型运行容器）

Quanta Challenge 前端题型的题目容器：把用户提交的静态站点快照跑起来，供 Playwright 判题机访问。镜像内只有一个 nginx 静态服务，无业务代码。

> 包名和镜像名沿用历史上的 `live-server`（调度器、deploy webhook 都按 `challenge-live-server-agent` 找镜像），实现已换成 nginx。

## 工作方式

- 基础镜像 `nginx:1.28-alpine`，nginx 配置和启动脚本都内联在 `Dockerfile` 里（CI 的变更检测只监听这一个文件，拆出去会导致改了配置不触发重建）
- 调度器把用户代码快照 bind mount 到 `/app`，快照内保留一层 `project/` 目录，因此站点根目录是 `/app/project`（否则找不到 `index.html`，判题脚本会一直等待选择器直到超时）
- 端口 3000；nginx 能响应 HTTP 后才在 stdout 输出 `Ready`，调度器靠这个字符串判定就绪
- 与原 live-server 的行为差异：不再向 HTML 注入热更新脚本、不列目录、无 SPA 回退（与原先一致）、所有响应带 `Cache-Control: no-store`
- worker 以 root 运行，保证无论宿主机 umask 如何都能读到调度器写出的快照文件
- 仅接入 `orange-network` 判题网络，通过容器网络别名访问（`http://<alias>:3000`），不发布宿主机端口
- 容器由调度器按任务创建（`AutoRemove`，带内存 / CPU / 进程数上限），任务结束后自动回收

## 构建与使用

```bash
# 仓库根执行（compose 中该镜像带 profiles: [ignore]，不会被自动构建）
pnpm --filter @challenge/live-server-agent docker:build
```

镜像名 `challenge-live-server-agent`。调度器启动时会用它创建题目容器，
缺镜像会导致前端题型全部失败，新环境必须预构建。Dockerfile 使用了 heredoc 语法，需要 BuildKit（Docker 23+ 默认启用）。
