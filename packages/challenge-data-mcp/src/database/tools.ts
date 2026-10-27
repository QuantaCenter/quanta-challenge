import { randomUUID } from 'node:crypto';
import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { AuditStore } from '../audit/sqlite-audit-store';
import { config } from '../config/index';
import { DATABASE_CATALOG } from './catalog';
import type { DataResult, SqlParameter } from './client';
import { ReadOnlyDatabase } from './client';

const rangeSchema = z.object({
  from: z.iso.datetime().optional().describe('起始时间，ISO 8601；默认 24 小时前'),
  to: z.iso.datetime().optional().describe('结束时间，ISO 8601；默认当前时间'),
});

export function registerDatabaseTools(
  server: McpServer,
  database: ReadOnlyDatabase,
  audit: AuditStore,
): void {
  server.registerTool(
    'database_schema',
    {
      title: '数据库业务字典',
      description: '返回允许查询的 agent_read 视图、字段及业务含义；生成 SQL 前应先调用。',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, ctx) => textResult(JSON.stringify(DATABASE_CATALOG, null, 2)),
  );

  server.registerTool(
    'database_query',
    {
      title: '受控只读 SQL',
      description: '执行一条 PostgreSQL SELECT/WITH 查询。只能访问 database_schema 列出的 agent_read 视图。',
      inputSchema: {
        sql: z.string().min(1).max(20_000),
        parameters: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).max(50).default([]),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ sql, parameters }, ctx) =>
      runAudited(audit, ctx, 'database_query', { parameterCount: parameters.length }, sql, () =>
        database.query(sql, parameters as SqlParameter[]),
      ),
  );

  server.registerTool(
    'platform_summary',
    {
      title: '平台概览',
      description: '统计指定时间范围内新增用户、活跃用户、提交量、通过量与发布题目数。',
      inputSchema: rangeSchema.shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args, ctx) => {
      const [from, to] = normalizeRange(args);
      return runAudited(audit, ctx, 'platform_summary', { from, to }, undefined, () =>
        database.semanticQuery(
          `SELECT
             (SELECT count(*) FROM agent_read.users WHERE created_at >= $1 AND created_at < $2) AS new_users,
             (SELECT count(*) FROM agent_read.users WHERE last_active_at >= $1 AND last_active_at < $2) AS active_users,
             (SELECT count(*) FROM agent_read.judge_records WHERE type = 'judge' AND created_at >= $1 AND created_at < $2) AS submissions,
             (SELECT count(*) FROM agent_read.judge_records WHERE type = 'judge' AND result = 'success' AND created_at >= $1 AND created_at < $2) AS successful_submissions,
             (SELECT count(*) FROM agent_read.problems WHERE status = 'published' AND created_at >= $1 AND created_at < $2) AS published_problem_versions`,
          [from, to],
        ),
      );
    },
  );

  server.registerTool(
    'judge_statistics',
    {
      title: '判题统计',
      description: '按结果与题型统计提交量、平均排队和判题耗时。',
      inputSchema: rangeSchema.extend({
        problemId: z.number().int().positive().optional(),
      }).shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args, ctx) => {
      const [from, to] = normalizeRange(args);
      return runAudited(audit, ctx, 'judge_statistics', { ...args, from, to }, undefined, () =>
        database.semanticQuery(
          `SELECT p.problem_type, j.result, count(*) AS submissions,
                  round(avg(j.pending_time_ms)) AS avg_pending_ms,
                  round(avg(j.judging_time_ms)) AS avg_judging_ms
             FROM agent_read.judge_records j
             JOIN agent_read.problems p ON p.pid = j.problem_id
            WHERE j.type = 'judge' AND j.created_at >= $1 AND j.created_at < $2
              AND ($3::integer IS NULL OR j.problem_id = $3)
            GROUP BY p.problem_type, j.result
            ORDER BY submissions DESC`,
          [from, to, args.problemId ?? null],
        ),
      );
    },
  );

  server.registerTool(
    'problem_statistics',
    {
      title: '题目统计',
      description: '统计题目的提交人数、提交量、成功率与平均耗时。',
      inputSchema: rangeSchema.extend({
        problemId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }).shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args, ctx) => {
      const [from, to] = normalizeRange(args);
      return runAudited(audit, ctx, 'problem_statistics', { ...args, from, to }, undefined, () =>
        database.semanticQuery(
          `SELECT p.pid, p.title, p.difficulty, p.problem_type,
                  count(j.id) AS submissions,
                  count(DISTINCT j.user_id) AS submitters,
                  round(100.0 * count(j.id) FILTER (WHERE j.result = 'success') / NULLIF(count(j.id), 0), 2) AS success_rate_pct,
                  round(avg(j.judging_time_ms)) AS avg_judging_ms
             FROM agent_read.problems p
             LEFT JOIN agent_read.judge_records j
               ON j.problem_id = p.pid AND j.type = 'judge' AND j.created_at >= $1 AND j.created_at < $2
            WHERE ($3::integer IS NULL OR p.pid = $3)
            GROUP BY p.pid, p.title, p.difficulty, p.problem_type
            ORDER BY submissions DESC, p.pid
            LIMIT $4`,
          [from, to, args.problemId ?? null, args.limit],
        ),
      );
    },
  );

  server.registerTool(
    'user_activity',
    {
      title: '用户活跃查询',
      description: '按用户名或用户 ID 查询活跃、提交与打卡汇总；返回信息不含邮箱和认证数据。',
      inputSchema: rangeSchema.extend({
        user: z.string().trim().min(1).max(100),
      }).shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args, ctx) => {
      const [from, to] = normalizeRange(args);
      return runAudited(audit, ctx, 'user_activity', { user: args.user, from, to }, undefined, () =>
        database.semanticQuery(
          `SELECT u.id, u.name, u.display_name, u.role, u.score, u.last_active_at,
                  count(DISTINCT j.id) AS submissions,
                  count(DISTINCT j.id) FILTER (WHERE j.result = 'success') AS successful_submissions,
                  count(DISTINCT d.id) AS daily_checkins
             FROM agent_read.users u
             LEFT JOIN agent_read.judge_records j
               ON j.user_id = u.id AND j.type = 'judge' AND j.created_at >= $2 AND j.created_at < $3
             LEFT JOIN agent_read.daily_checkins d
               ON d.user_id = u.id AND d.date >= $2 AND d.date < $3
            WHERE u.id = $1 OR lower(u.name) = lower($1)
            GROUP BY u.id, u.name, u.display_name, u.role, u.score, u.last_active_at`,
          [args.user, from, to],
        ),
      );
    },
  );

  server.registerTool(
    'webauthn_status',
    {
      title: 'WebAuthn 绑定状态',
      description: '按用户名或用户 ID 查询 WebAuthn 凭据数量、使用时间、transport 和计数器状态；不返回凭据 ID或公钥。',
      inputSchema: {
        user: z.string().trim().min(1).max(100),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ user }, ctx) =>
      runAudited(audit, ctx, 'webauthn_status', { user }, undefined, () =>
        database.semanticQuery(
          `SELECT u.id AS user_id, u.name, u.display_name,
                  coalesce(w.credential_count, 0) AS credential_count,
                  w.first_registered_at, w.last_registered_at, w.last_used_at,
                  coalesce(w.transports, ARRAY[]::text[]) AS transports,
                  w.max_counter, coalesce(w.zero_counter_count, 0) AS zero_counter_count
             FROM agent_read.users u
             LEFT JOIN agent_read.webauthn_summary w ON w.user_id = u.id
            WHERE u.id = $1 OR lower(u.name) = lower($1)`,
          [user],
        ),
      ),
  );
}

function normalizeRange(args: { from?: string; to?: string }): [string, string] {
  const to = args.to ? new Date(args.to) : new Date();
  const from = args.from ? new Date(args.from) : new Date(to.getTime() - 24 * 3_600_000);
  if (from >= to) throw new Error('from 必须早于 to');
  if (to.getTime() - from.getTime() > config.maxLookbackHours * 3_600_000) {
    throw new Error(`查询范围不能超过 ${config.maxLookbackHours} 小时`);
  }
  if (to.getTime() > Date.now() + 5 * 60_000) throw new Error('to 不能明显晚于当前时间');
  return [from.toISOString(), to.toISOString()];
}

async function runAudited(
  audit: AuditStore,
  ctx: ServerContext,
  tool: string,
  args: unknown,
  query: string | undefined,
  execute: () => Promise<DataResult>,
) {
  const startedAt = Date.now();
  const caller = ctx.http?.authInfo?.clientId ?? 'unknown';
  const traceId = randomUUID();
  try {
    const result = await execute();
    audit.record({ traceId, caller, tool, arguments: args, query, startedAt, status: 'success', rowCount: result.rowCount });
    return textResult(`${result.text}\n\ntrace_id: ${traceId}`);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : 'QUERY_FAILED';
    audit.record({ traceId, caller, tool, arguments: args, query, startedAt, status: 'error', errorCode: code });
    return {
      content: [{ type: 'text' as const, text: `查询失败：${error instanceof Error ? error.message : '未知错误'}\ntrace_id: ${traceId}` }],
      isError: true,
    };
  }
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}
