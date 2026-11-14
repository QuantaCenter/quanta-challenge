# 工坊命名迁移

工坊统一使用 `workshop`：页面、REST / tRPC 接口、GitHub 授权目标、标签用途、
Prisma 模型、共享模板导出及前端状态键均采用新名称，不提供旧 `lab` 入口或别名。

数据库迁移为 `20261223000000_rename_lab_to_workshop`，历史迁移保持原样。
新迁移在一个事务中原地重命名以下表，保留已有数据及关联：

| 原表 | 新表 |
| --- | --- |
| `lab_projects` | `workshop_projects` |
| `lab_templates` | `workshop_templates` |
| `lab_categories` | `workshop_categories` |
| `lab_github_imports` | `workshop_github_imports` |

同时重命名 `file_systems.workshopProjectId` 对应的旧列、相关索引和约束，
将项目来源枚举改为 `WorkshopProjectSource`，标签用途枚举值改为 `workshop`。
GitHub 连接和加密凭据保持原样。

发布时数据库迁移与新应用版本一起切换；旧应用不能继续访问改名后的表。
容器启动入口会先运行 `prisma migrate deploy`，成功后才启动应用。
自定义项目限额改用 `WORKSHOP_MAX_FILE_BYTES`、`WORKSHOP_MAX_PROJECT_BYTES`、
`WORKSHOP_MAX_PROJECTS_PER_USER`，未配置时沿用原默认值。

迁移验证命令：

```sh
pnpm --filter @challenge/app test:workshop:migration
```

测试只允许本地 PostgreSQL，为每次运行创建独立数据库并在结束时删除，
验证历史项目、文件、模板、标签、导入记录和约束均能保留，且不引入新的 schema 差异。
