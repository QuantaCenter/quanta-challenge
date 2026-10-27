# @challenge/e2e

Playwright 端到端漫游测试：登录进入主界面 → 漫游所有页面 → 每一步截图。
**无自动断言**，截图产出后交由人工确认显示效果。

独立于 `packages/` 的顶层 `e2e/` 工作区包，但复用 `@challenge/database`（workspace 依赖）直连数据库注入测试数据。

## 结构

| 路径 | 说明 |
|------|------|
| `seed/seed.ts` | 测试数据注入（幂等）：管理员、普通用户、已发布题目、标签、成就、通知、判题记录 |
| `tests/auth.setup.ts` | 登录流程（每步截图），产出 `.auth/admin.json` 会话供后续测试复用 |
| `tests/public.spec.ts` | 公开页漫游（做题页 / 提交记录页） |
| `tests/roam.spec.ts` | 登录后主界面漫游（普通页 + 管理端 + 发布端） |
| `screenshots/` | 截图输出（`login/`、`public/`、`roam/`，已 gitignore） |
| `.e2e-ids.json` | seed 写出的动态 id（题目 pid、成就 id），供动态路由使用 |

## 本地运行

前置：本地 PostgreSQL / Redis 可用（如 `pnpm docker:up:dev` 的 25432 / 26379），且 Web 应用已启动。

```bash
# 1. 注入测试数据
DATABASE_URL=postgres://quanta:quanta@localhost:25432/quanta_db pnpm --filter @challenge/e2e seed

# 2. 运行漫游（截图落在 e2e/screenshots/）
E2E_BASE_URL=http://localhost:3000 pnpm --filter @challenge/e2e test:e2e

# 查看报告
pnpm --filter @challenge/e2e show-report
```

> 注意：本地运行请使用包内的 Playwright（`pnpm --filter @challenge/e2e exec playwright ...`），
> 不要用 `npx playwright`——仓库中判题机（judge-machine）固定了另一个 Playwright 版本，
> `npx` 可能解析到错误副本导致 `test() called here` 报错。

## CI

见 `.github/workflows/e2e-frontend.yml`：整个 job 跑在 Playwright 官方镜像容器中
（浏览器与系统依赖内置，免安装），服务容器起 PostgreSQL 16 / Redis 7 →
`prisma migrate deploy` → seed 注入 → 构建并以非 production 模式启动 Web 应用
（避免登录 cookie 带 `secure`）→ Playwright 漫游 → 截图上传为 artifact
`e2e-screenshots`，并在 Job Summary 列出截图清单供人工确认。

> 注意：镜像 tag（如 `v1.64.1-noble`）必须与 `@playwright/test` 的钉死版本严格一致，
> 升级 Playwright 时两处要同步修改。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `E2E_BASE_URL` | `http://localhost:3000` | 被测站点地址 |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | `e2e-admin@quanta.test` / `e2e-admin-password` | 登录账号（与 seed 一致） |
| `E2E_PROBLEM_PID` / `E2E_ACHIEVEMENT_ID` | `.e2e-ids.json` | seed 注入的动态 id |
