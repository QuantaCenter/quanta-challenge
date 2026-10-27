# @challenge/backend-service-agent（后端题型运行容器）

Quanta Challenge 后端服务题型的题目容器镜像：启动用户的后端服务，供后端判题机发 HTTP 请求断言。镜像本身不含任何题目，只提供「离线装依赖 + 按题目配置启动 + 就绪探测」的统一入口。

## 镜像

- 基础镜像 `node:24-slim`，含 openssl 与 node-gyp 编译工具链（部分题目的依赖需要编译）
- pnpm 锁定为 `9.15.9`：pnpm store 的磁盘布局与大版本绑定（9 = `v3/`），漂移会让调度器预热的缓存全部 miss
- 镜像注册表 id 为 `node-24`（登记在 `@challenge/shared/backend-service-image`，换基础镜像要同步加注册表条目）

## 启动流程（`entrypoint.sh`）

调度器创建容器时注入以下环境变量（来源为题目配置 `problem.config.ts` 的 `runtime`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `QUANTA_APP_DIR` | `/app/project` | 题目目录（`judgeUploadPath` 对应的挂载路径） |
| `QUANTA_STORE_DIR` | `/pnpm-store` | pnpm store（调度器以**只读**方式挂载预热好的缓存） |
| `QUANTA_START_COMMAND` | - | 题目启动命令，必填 |
| `QUANTA_PORT` | `3000` | 服务监听端口（探测用） |
| `QUANTA_WORK_DIR` | `/app` | 启动命令的工作目录（快照根，与 WebContainer 中 `initCommand` 的相对路径基准一致） |
| `QUANTA_READY_TIMEOUT` | `60` | 端口就绪探测上限（秒） |

流程：

1. 在 `QUANTA_APP_DIR` 内执行 `pnpm install --offline --frozen-lockfile --store-dir $QUANTA_STORE_DIR`（无 `pnpm-lock.yaml` 则跳过；离线安装失败直接退出并提示先 `POST /cache/update` 预热）
2. 在 `QUANTA_WORK_DIR` 用 `sh -c` 执行 `QUANTA_START_COMMAND`（支持管道、`&&` 等 shell 语法）
3. 探测 `127.0.0.1:$QUANTA_PORT` 就绪（每 300ms 重试）
4. 打印 `[quanta] Ready` —— **这是调度器的就绪信号，格式不要改**
5. `wait` 前台服务进程，容器生命周期跟随服务

## 构建与使用

```bash
pnpm --filter @challenge/backend-service-agent docker:build
```

镜像名按注册表解析（见 `@challenge/shared/backend-service-image`）。容器由调度器按任务创建（`AutoRemove`、资源上限、`orange-network` 网络），镜像需要预先构建；只跑前端题型时不需要。

完整链路与题目约定见 `docs/BACKEND_SERVICE_PROBLEM.md`。
