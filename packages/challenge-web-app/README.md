# @challenge/app（Web 应用）

Quanta Challenge 的用户端与管理端 Web 应用，基于 Nuxt 4（Vue 3 + Nitro）。提供在线代码编辑与实时预览、题目浏览、判题记录、排行榜、成就体系、通知，以及题目 / 云函数 / 成就 / 标签的发布与管理界面。

## 主要功能

- **在线编辑器**：Monaco Editor + WebContainer。前端题型在浏览器内实时预览（`challenge/_subpages/editor`），后端题型提供请求构造 / 响应查看 / 终端面板
- **判题提交与记录**：代码快照提交到评测调度器，`server/api/webhooks` 接收判题完成回调，更新排行榜与通知
- **用户体系**：账号密码 + WebAuthn（Passkey）认证，JWT access / refresh token（`server/api/refresh`）；同时承载 `qpc` 的 OAuth 2.0 设备授权页（`/auth/device`）
- **题目 / 云函数 / 成就发布**：出题发布页、云函数源码编辑与 API Key 管理、成就依赖数据与校验脚本
- **监控**：前端接入 Sentry SDK（`@sentry/nuxt`），浏览器事件经 tunnel（`/api/observation/sentry-tunnel`）同源转发到采集服务的 Envelope 端点，服务端（SSR）按 DSN 直连，均不直连 Sentry SaaS；Nitro 侧暴露 `/metrics`

## 目录结构

```
challenge-web-app/
├── app/                    # 前端源码
│   ├── pages/              # 路由：index / auth / challenge(编辑器+记录)
│   │                       #       app(仪表盘/题目/排行/成就/通知/设置/个人空间)
│   │                       #       manage(成员/标签/云函数/成就)
│   │                       #       publish(题目/云函数/成就/标签)
│   ├── components/         # Vue 组件
│   ├── composables/        # 组合式函数
│   ├── stores/             # Pinia（auth / editor / layout）
│   ├── layouts/ middlewares/ plugins/ utils/ types/
├── server/                 # Nitro 服务端
│   ├── api/                # REST 端点：refresh / webhooks / oauth / observation
│   │                       #   / sse / static / cloud-function 代理 / admin
│   ├── trpc/               # tRPC 路由（public / protected / admin）
│   ├── middleware/         # HTTP 指标等
│   ├── plugins/            # validate-secrets（生产密钥校验）、dev-resilience
│   ├── services/ tasks/ templates/ utils/
├── lib/                    # 工具库
├── scripts/
│   ├── docker-entrypoint.sh  # 容器入口：先 prisma migrate deploy 再启动
│   ├── pre-build.ts / post-build.ts
│   ├── prisma-seed.ts / achievement-seed-data.ts  # 种子数据
│   ├── dev-watchdog.mjs / replay-webhook.mjs
├── Dockerfile
└── nuxt.config.ts
```

## 开发

```bash
pnpm dev            # nuxt dev --host
pnpm build          # pre-build + nuxt build + post-build
pnpm build:large    # 大内存构建（--max-old-space-size=6144）
pnpm typecheck      # nuxt prepare + tsc(server) + vue-tsc(app)
```

本地开发依赖 PostgreSQL 与 Redis（启动方式见仓库根 README），数据库迁移用 `pnpm prisma:update`。

## 部署要点

- 环境变量以 `docker/docker-compose.yaml` 为准（`DATABASE_URL`、`APP_SERVER`、`JUDGE_SERVER`、`ACCESS_TOKEN_SECRET` 等），完整表见仓库根 README
- Nuxt build 会把 `runtimeConfig` 烘焙成字面量，运行时只有 `NUXT_` 前缀的变量能覆盖
- 生产密钥缺失时 `server/plugins/validate-secrets.ts` 会在启动阶段直接报错，不静默降级
- 容器入口先执行 `prisma migrate deploy`（幂等，带 advisory lock），无需手工迁移
