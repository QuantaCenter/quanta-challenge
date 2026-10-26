import assert from 'node:assert/strict';
import test from 'node:test';
import { DATABASE_CATALOG } from '../src/database/catalog';
import { OBSERVABILITY_GUIDE, USAGE_GUIDE } from '../src/resources';

test('使用指南覆盖工具选择、工作流、限制和回答规范', () => {
  assert.match(USAGE_GUIDE, /工具选择/);
  assert.match(USAGE_GUIDE, /标准工作流/);
  assert.match(USAGE_GUIDE, /trace_id/);
  assert.match(USAGE_GUIDE, /database_schema → database_query/);
});

test('可观测性指南包含真实指标、标签和查询示例', () => {
  assert.match(OBSERVABILITY_GUIDE, /http_requests_total/);
  assert.match(OBSERVABILITY_GUIDE, /judge_queue_depth/);
  assert.match(OBSERVABILITY_GUIDE, /histogram_quantile/);
  assert.match(OBSERVABILITY_GUIDE, /source="docker"/);
  assert.match(OBSERVABILITY_GUIDE, /Prometheus 默认保留 15 天/);
});

test('数据库字典包含关系、枚举、约定和安全 SQL 示例', () => {
  assert.ok(DATABASE_CATALOG.relationships.includes('users.id = webauthn_summary.user_id'));
  assert.deepEqual(DATABASE_CATALOG.enums.judgeResult, ['pending', 'success', 'failed']);
  assert.match(DATABASE_CATALOG.conventions.timeRange, /左闭右开/);
  assert.match(DATABASE_CATALOG.queryExamples.webauthnStatus, /webauthn_summary/);
});
