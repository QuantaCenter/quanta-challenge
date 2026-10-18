# @challenge/database

Quanta Challenge 的数据库层：Prisma Schema、迁移与客户端导出。被 Web 应用、评测调度器、云函数服务共同依赖。

## 目录结构

```
database/
├── prisma/
│   ├── schema.prisma        # 唯一 schema 真源
│   ├── migrations/          # SQL 迁移文件
│   ├── name-map/            # 表名映射生成脚本（见下）
│   └── lib/                 # 生成的 Prisma 客户端
├── scripts/
│   └── seed-cloud-function-demo.mjs   # 云函数演示数据
└── index.ts                 # 导出 prisma 客户端 + name-map
```

## 数据模型概览

- **用户与认证**：`User` / `UserInfo` / `Auth` / `WebAuthnCredential` / `RoleTransition` / `UserSetting` / `UserSpaceConfig`
- **题目**：`BaseProblems` / `Problems`（版本）/ `ProblemVersionTransitions` / `ProblemDefaultCovers` / `AuditRecords` / `StatusTransitions` / `Tags`
- **判题**：`TemplateJudgeRecords`（审计标准答案）/ `JudgeRecords` / `JudgeStatus` / `JudgeFiles`
- **代码快照**：`FileSystems` / `Projects` / `VirtualFiles` / `ShadowFile`
- **每日挑战**：`DailyProblem` / `DailyCheckin`
- **成就体系**：`Achievement` 及依赖数据、校验脚本、前置成就、打卡成就等
- **统计与排行**：`UserStatistic` / `RankingHistory` / `UserAchievement`
- **通知**：`Notification`
- **云函数**：`CloudFunction` / `CloudFunctionVersion` / `CloudFunctionApiKey` / `CloudFunctionInvocation`

## 脚本

| 命令 | 作用 |
|------|------|
| `pnpm prisma:update` | `migrate dev` + `generate` + 重新生成 name-map（日常开发用） |
| `pnpm prisma:migrate` | 仅 `migrate dev` |
| `pnpm prisma:migrate:deploy` | `migrate deploy`（部署用，幂等，带 advisory lock） |
| `pnpm prisma:generate` | 生成客户端 + name-map |
| `pnpm prisma:mapping` | 仅重新生成 name-map |

### name-map

`prisma/name-map/generate-script.mjs` 用 `@loancrate/prisma-schema-parser` 解析 schema，
提取 model 与数据库表名的映射，生成 `name-map/_output.ts` 并由包入口导出，
供服务端在模型名与实际表名（snake_case）之间转换。

> ⚠️ 修改 schema 后必须用 `pnpm prisma:update`（而不是裸跑 `prisma migrate dev`），
> 否则 name-map 不会同步更新，服务端表名映射会与 schema 脱节。

## 使用方式

```typescript
import prisma, { User } from '@challenge/database'; // 命名导出来自 name-map
```

部署环境中容器入口（web-app / 调度器 / 云函数）启动时都会先执行
`prisma migrate deploy`，无需手工迁移。
