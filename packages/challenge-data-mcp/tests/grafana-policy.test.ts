import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATA_MCP_BEARER_TOKENS = 'test:test-token';
process.env.DATA_MCP_DATABASE_URL = 'postgresql://unused';
process.env.DATA_MCP_MAX_LOOKBACK_HOURS = '24';

test('Grafana 参数限制日志数量和时间范围', async () => {
  const { enforceGrafanaBounds } = await import('../src/grafana/proxy');
  const bounded = enforceGrafanaBounds({
    limit: 50_000,
    start: new Date(Date.now() - 3_600_000).toISOString(),
    end: new Date().toISOString(),
  }) as Record<string, unknown>;
  assert.equal(bounded.limit, 1_000);

  assert.throws(() =>
    enforceGrafanaBounds({
      from: new Date(Date.now() - 48 * 3_600_000).toISOString(),
      to: new Date().toISOString(),
    }),
  );
});
