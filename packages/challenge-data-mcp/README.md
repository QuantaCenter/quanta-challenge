# @challenge/data-mcp

统一、只读的查数 MCP 网关。外部 Agent 只连接一个 Streamable HTTP endpoint，即可使用：

- PostgreSQL 业务语义工具和受控只读 SQL；
- 官方 Grafana MCP 提供的 Prometheus / Loki / datasource 工具；
- 数据库业务字典、可观测性指南和排障 prompt；
- 按调用方记录的本地 SQLite 审计。

## 安全边界

1. 网关要求 `Authorization: Bearer <token>`，token 配置为 `caller:token`，caller 会写入审计。
2. 数据库账号 `data_agent_reader` 只能读取 `agent_read` 下的安全视图，不能访问 `public` 基础表。
3. 通用 SQL 仅允许单条 `SELECT` / `WITH ... SELECT`，再由 PostgreSQL `READ ONLY` 事务、超时和行数限制兜底。
4. Grafana sidecar 只启用 `datasource,prometheus,loki`，并通过 `--disable-write` 禁止写操作。
5. 结果统一限制体积并脱敏；审计只保存参数摘要和 SQL SHA-256，不保存完整结果。

提示词不是安全控制。生产部署必须使用独立的数据库只读账号和 Grafana Service Account。

## 目录结构

```text
challenge-data-mcp/
├── src/
│   ├── main.ts                     # Composition Root：创建依赖、启动服务、优雅退出
│   ├── config/index.ts             # 环境变量解析与强类型配置
│   ├── mcp/create-server.ts        # MCP tools/resources/prompts 组装
│   ├── transport/http-server.ts    # Streamable HTTP、鉴权入口、健康检查
│   ├── database/                   # 数据库功能模块
│   │   ├── catalog.ts              # 业务字典
│   │   ├── client.ts               # PostgreSQL 只读事务
│   │   ├── sql-policy.ts           # 动态 SQL 安全策略
│   │   └── tools.ts                # 数据库 MCP 工具
│   ├── grafana/proxy.ts            # 官方 Grafana MCP 客户端及工具代理
│   ├── security/                   # Bearer 鉴权与结果脱敏
│   ├── audit/sqlite-audit-store.ts # SQLite 审计适配器
│   └── resources.ts                # Agent 使用与可观测性指南内容
├── tests/                          # 单元与 MCP 协议测试
├── sql/provision-reader.sql        # 数据库只读角色与安全视图
├── Dockerfile
└── tsup.config.ts
```

依赖方向为：`main → transport/mcp → database|grafana|security|audit`。`main.ts` 是唯一组合入口，协议路由不负责创建数据库或审计实例。

## 部署

### 1. 创建数据库只读角色和视图

从仓库根目录执行：

```bash
psql 'postgresql://quanta:<管理员密码>@127.0.0.1:25432/quanta_db' \
  -v reader_password='<DATA_MCP_READER_PASSWORD>' \
  -f packages/challenge-data-mcp/sql/provision-reader.sql
```

脚本幂等，可在数据库 schema 变更后重新执行。已有数据库必须手工执行；Postgres init 脚本只会在空数据目录生效，因此这里没有使用它。
`reader_password` 传原始密码；`DATA_MCP_DATABASE_URL` 中的密码含 `@`、`:`、`/` 等保留字符时需 URL 编码。

可验证权限：

```bash
psql 'postgresql://data_agent_reader:<密码>@127.0.0.1:25432/quanta_db' \
  -c 'select count(*) from agent_read.users'
```

下面两条必须失败：

```sql
SELECT * FROM public.auths;
DELETE FROM agent_read.users;
```

### 2. 创建 Grafana Service Account

在 Grafana 的 **Administration → Users and access → Service accounts** 中创建专用 Viewer Service Account：

- 只授予 Prometheus（UID `prometheus`）和 Loki（UID `loki`）datasource 查询权限；
- 创建 token，填入 `GRAFANA_MCP_SERVICE_ACCOUNT_TOKEN`；
- 不要使用 Grafana 管理员账号或管理员 token。

### 3. 配置并启动

```bash
cd packages/challenge-observation
cp deploy/.env.example deploy/.env
# 修改所有 change-me 项
bash scripts/init-data-dirs.sh
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
curl -s http://127.0.0.1:9320/healthz
```

健康状态为 `degraded` 表示数据库网关已启动、Grafana MCP 尚未连接；网关每 30 秒重连。

### 4. 配置 MCP 客户端

`.cursor/mcp.json` 或兼容的 MCP 客户端配置：

```json
{
  "mcpServers": {
    "quanta-data": {
      "url": "http://127.0.0.1:9320/mcp",
      "headers": {
        "Authorization": "Bearer change-me-random-mcp-token"
      }
    }
  }
}
```

服务默认只绑定宿主机回环地址。远程 Agent 应通过带 TLS 的反向代理访问，并把代理域名加入 `DATA_MCP_ALLOWED_HOSTS`；不要直接暴露 9320 端口。

## 工具

| 工具 | 用途 |
| --- | --- |
| `database_schema` | 查看允许查询的视图、字段和说明 |
| `database_query` | 执行受控只读 PostgreSQL SQL |
| `platform_summary` | 新增/活跃用户、提交和发布概览 |
| `judge_statistics` | 判题结果、排队和执行耗时 |
| `problem_statistics` | 题目提交人数、成功率和耗时 |
| `user_activity` | 单个用户的活跃、提交和打卡 |
| `webauthn_status` | 用户 WebAuthn 绑定、使用时间和计数器状态（不含凭据 ID、公钥） |
| `grafana_*` | 官方 Grafana MCP 暴露的只读指标/日志工具 |

示例：

- “过去 24 小时平台有多少活跃用户和成功提交？”
- “最近一小时 API 5xx 是否升高？列出同期错误日志。”
- “题目 123 最近七天成功率和平均判题耗时是多少？”

回答应始终注明查询窗口、数据源和不确定性。空结果不应直接解释为零。

## MCP Resources

| URI | 内容 | 建议读取时机 |
| --- | --- | --- |
| `quanta://usage/guide` | 工具选择、业务查数/故障排查流程、限制、回答规范和示例 | 首次使用 |
| `quanta://database/catalog` | 视图字段、枚举、关联关系、查询约定和 SQL 示例 | 调用 `database_query` 前 |
| `quanta://observability/guide` | 指标与标签字典、PromQL/LogQL 示例、保留期和排障顺序 | 查询 Grafana 前 |

MCP Server 的 instructions 会提示 Agent 按上述顺序读取资源。客户端如果不会自动读取 Resources，可在系统提示中明确要求它先读取对应 URI。

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATA_MCP_BEARER_TOKENS` | 必填 | `caller:token`，多个值用逗号分隔 |
| `DATA_MCP_DATABASE_URL` | 必填 | `data_agent_reader` 连接串 |
| `GRAFANA_MCP_URL` | `http://grafana-mcp:8000/mcp` | 内部官方 Grafana MCP 地址 |
| `DATA_MCP_AUDIT_DB_PATH` | `/data/audit.sqlite3` | 审计 SQLite |
| `DATA_MCP_QUERY_TIMEOUT_MS` | `5000` | SQL statement timeout |
| `DATA_MCP_MAX_ROWS` | `200` | SQL 最大返回行数 |
| `DATA_MCP_MAX_RESULT_BYTES` | `512000` | 单次工具结果最大字节数 |
| `DATA_MCP_MAX_LOOKBACK_HOURS` | `720` | SQL 语义工具和 Grafana 最大回看范围 |

轮换 token 时修改 `.env` 后重建 `data-mcp` / `grafana-mcp` 容器。审计库位于 `deploy/data/data-mcp/audit.sqlite3`，应纳入现有监控备份。

## 本地开发

```bash
pnpm --filter @challenge/data-mcp typecheck
pnpm --filter @challenge/data-mcp test
pnpm --filter @challenge/data-mcp build
```
