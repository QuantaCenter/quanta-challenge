# @challenge/live-server-agent（前端题型运行容器）

Quanta Challenge 前端题型的题目容器：把用户提交的静态站点快照跑起来，供 Playwright 判题机访问。镜像内只有一个全局安装的静态服务器，无业务代码。

## 工作方式

- 基础镜像 `node:slim`，全局安装 `live-server@1.2.2`（**锁版本**，防止重建镜像时上游漂移）
- 调度器把用户代码快照 bind mount 到 `/app`，快照内保留一层 `project/` 目录，因此站点根目录必须显式指定为 `project` 子目录（否则 `/app` 下没有 `index.html`，判题脚本会一直等待选择器直到超时）
- 启动命令：`live-server project --port=3000 --host=0.0.0.0 --no-browser`
- 端口 3000，仅接入 `orange-network` 判题网络，通过容器网络别名访问（`http://<alias>:3000`），不发布宿主机端口
- 容器由调度器按任务创建（`AutoRemove`，带内存 / CPU / 进程数上限），任务结束后自动回收

## 构建与使用

```bash
# 仓库根执行（compose 中该镜像带 profiles: [ignore]，不会被自动构建）
pnpm --filter @challenge/live-server-agent docker:build
```

镜像名 `challenge-live-server-agent`。调度器启动时会用它创建 live-server 容器，
缺镜像会导致前端题型全部失败，新环境必须预构建。
