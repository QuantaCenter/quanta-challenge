# challenge-agents（判题与题目运行容器镜像）

Quanta Challenge 判题链路用到的四个容器镜像集合。它们在 `docker/docker-compose*.yaml` 里都带 `profiles: [ignore]`（Compose 不会构建），容器由评测调度器在运行期通过 Docker API 按需创建，因此**新环境必须预构建镜像**。

## 子包

| 包 | 镜像名 | 用途 |
|----|--------|------|
| [`judge-machine`](./judge-machine/) | `challenge-judge-machine-agent` | 前端题型判题机：Playwright + VM2 沙箱执行判题脚本，JRTP 回传结果（容器 3000 → 宿主机 1889） |
| [`live-server`](./live-server/) | `challenge-live-server-agent` | 前端题型题目容器：静态服务器运行用户站点快照 |
| [`backend-service`](./backend-service/) | 按 `@challenge/shared/backend-service-image` 注册表解析（如 `node-24`） | 后端题型题目容器：离线装依赖并启动用户后端服务 |
| [`backend-judge-machine`](./backend-judge-machine/) | `challenge-backend-judge-machine-agent` | 后端题型判题机：VM2 沙箱内受约束的 HTTP 客户端断言用户服务（懒加载，容器 3000 → 宿主机 1891） |

## 构建命令

```bash
pnpm --filter @challenge/judge-machine-agent docker:build
pnpm --filter @challenge/live-server-agent docker:build

# 后端题型（只有存在后端题目时才需要）
pnpm --filter @challenge/backend-service-agent docker:build
pnpm --filter @challenge/backend-judge-machine-agent docker:build
```

## 运行约定

- 所有容器接入 `orange-network` 判题网络，通过容器网络别名互访，不发布业务端口（判题机例外：WebSocket 需要映射到宿主机 1889 / 1891 供调度器连接）
- 题目容器与判题机容器均由调度器设置 `AutoRemove` 与资源上限（内存 / CPU shares / 进程数），任务结束自动回收
- 前端判题机镜像缺失时调度器降级运行（`/health` 返回 `degraded`），后端题型不受影响
