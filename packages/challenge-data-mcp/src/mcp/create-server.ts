import { McpServer } from '@modelcontextprotocol/server';
import type { AuditStore } from '../audit/sqlite-audit-store';
import { DATABASE_CATALOG } from '../database/catalog';
import type { ReadOnlyDatabase } from '../database/client';
import { registerDatabaseTools } from '../database/tools';
import type { GrafanaProxy } from '../grafana/proxy';
import { OBSERVABILITY_GUIDE, USAGE_GUIDE } from '../resources';

export interface McpServerDependencies {
  database: ReadOnlyDatabase;
  audit: AuditStore;
  grafana: GrafanaProxy;
}

export function createDataMcpServer({
  database,
  audit,
  grafana,
}: McpServerDependencies): McpServer {
  const server = new McpServer(
    { name: 'challenge-data-mcp', version: '0.1.0' },
    {
      capabilities: { tools: {}, resources: {}, prompts: {} },
      instructions:
        '这是只读查数服务。首次使用先读取 quanta://usage/guide；写 SQL 前读取 quanta://database/catalog；排障前读取 quanta://observability/guide。回答必须说明时间范围、数据来源、统计口径、截断状态和 trace_id，不得把相关性推断为因果关系。',
    },
  );

  registerDatabaseTools(server, database, audit);
  grafana.registerTools(server, audit);
  registerResources(server);
  registerPrompts(server);
  return server;
}

function registerResources(server: McpServer): void {
  server.registerResource(
    'usage-guide',
    'quanta://usage/guide',
    {
      title: 'Quanta 查数 MCP 完整使用指南',
      description: '工具选择、标准工作流、限制、回答规范和示例提问；首次使用应先读取',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: USAGE_GUIDE }],
    }),
  );

  server.registerResource(
    'database-catalog',
    'quanta://database/catalog',
    {
      title: 'Quanta 数据库业务字典',
      description: 'Agent 可查询的安全视图、字段、枚举、关系、约束和 SQL 示例',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(DATABASE_CATALOG, null, 2),
      }],
    }),
  );

  server.registerResource(
    'observability-guide',
    'quanta://observability/guide',
    {
      title: 'Quanta 可观测性查询指南',
      description: '指标和标签字典、PromQL/LogQL 示例、排障顺序与回答规范',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: OBSERVABILITY_GUIDE }],
    }),
  );
}

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'investigate_incident',
    {
      title: '排查线上异常',
      description: '生成跨指标、日志和业务数据的只读排障步骤。',
    },
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: '请先确认故障时间窗和服务，再查询 Prometheus 的错误率/吞吐/P95，随后用 Loki 查询同窗错误日志；如需判断业务影响，再调用语义数据库工具。最后列出证据、结论、不确定性和后续建议。',
        },
      }],
    }),
  );
}
