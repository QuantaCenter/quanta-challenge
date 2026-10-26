import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';

process.env.DATA_MCP_BEARER_TOKENS = 'test:test-token';
process.env.DATA_MCP_DATABASE_URL = 'postgresql://unused';

test('MCP 组合入口暴露预期工具、资源与指南内容', async () => {
  const [{ AuditStore }, { createDataMcpServer }] = await Promise.all([
    import('../src/audit/sqlite-audit-store'),
    import('../src/mcp/create-server'),
  ]);
  const audit = new AuditStore(':memory:');
  const database = {
    query: async () => ({ rows: [], rowCount: 0, truncated: false, text: '{"rows":[]}' }),
    semanticQuery: async () => ({ rows: [], rowCount: 0, truncated: false, text: '{"rows":[]}' }),
  };
  const grafana = {
    registerTools: () => undefined,
  };
  const server = createDataMcpServer({
    database: database as never,
    audit,
    grafana: grafana as never,
  });

  const client = new Client({ name: 'test-client', version: '0.1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name).sort(),
    ['database_query', 'database_schema', 'judge_statistics', 'platform_summary', 'problem_statistics', 'user_activity', 'webauthn_status'],
  );
  const schema = await client.callTool({ name: 'database_schema', arguments: {} });
  assert.equal(schema.isError, undefined);
  assert.match(JSON.stringify(schema.content), /agent_read/);
  const resources = await client.listResources();
  assert.deepEqual(
    resources.resources.map((resource) => resource.uri).sort(),
    ['quanta://database/catalog', 'quanta://observability/guide', 'quanta://usage/guide'],
  );
  const guide = await client.readResource({ uri: 'quanta://usage/guide' });
  assert.match(JSON.stringify(guide.contents), /标准工作流/);

  await client.close();
  await server.close();
  audit.close();
});
