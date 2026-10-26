import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport, type Tool } from '@modelcontextprotocol/client';
import { fromJsonSchema, type JsonSchemaType, type McpServer, type ServerContext } from '@modelcontextprotocol/server';
import type { AuditStore } from '../audit/sqlite-audit-store';
import { config } from '../config/index';
import { boundedJson, redactValue } from '../security/redaction';

export class GrafanaProxy {
  private client?: Client;
  private tools: Tool[] = [];

  get connected(): boolean {
    return Boolean(this.client && this.tools.length > 0);
  }

  async connect(): Promise<void> {
    const client = new Client(
      { name: 'challenge-data-mcp-grafana-proxy', version: '0.1.0' },
      { versionNegotiation: { mode: 'auto' } },
    );
    const transport = new StreamableHTTPClientTransport(config.grafanaMcpUrl);
    await client.connect(transport);
    const listed = await client.listTools();
    this.client = client;
    this.tools = listed.tools;
    if (this.tools.length === 0) throw new Error('Grafana MCP 未暴露任何工具');
  }

  registerTools(server: McpServer, audit: AuditStore): void {
    for (const tool of this.tools) {
      server.registerTool(
        `grafana_${tool.name}`,
        {
          title: tool.title ? `Grafana · ${tool.title}` : `Grafana · ${tool.name}`,
          description: `${tool.description ?? 'Grafana 只读查询工具'}。查询范围和返回数量受统一网关限制。`,
          inputSchema: fromJsonSchema(tool.inputSchema as JsonSchemaType),
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        async (args, ctx) => this.call(tool.name, args, ctx, audit),
      );
    }
  }

  private async call(name: string, args: unknown, ctx: ServerContext, audit: AuditStore) {
    const startedAt = Date.now();
    const traceId = randomUUID();
    const caller = ctx.http?.authInfo?.clientId ?? 'unknown';
    try {
      if (!this.client) throw new Error('Grafana MCP 尚未连接');
      const boundedArgs = enforceGrafanaBounds(args);
      const result = await this.client.callTool({ name, arguments: boundedArgs as Record<string, unknown> });
      const text = boundedJson(redactValue(result), config.maxResultBytes);
      audit.record({
        traceId,
        caller,
        tool: `grafana_${name}`,
        arguments: boundedArgs,
        startedAt,
        status: result.isError ? 'error' : 'success',
        errorCode: result.isError ? 'UPSTREAM_TOOL_ERROR' : undefined,
      });
      return {
        content: [{ type: 'text' as const, text: `${text}\n\ntrace_id: ${traceId}` }],
        isError: result.isError,
      };
    } catch (error) {
      const code = error instanceof GrafanaPolicyError ? error.code : 'GRAFANA_QUERY_FAILED';
      audit.record({
        traceId,
        caller,
        tool: `grafana_${name}`,
        arguments: args,
        startedAt,
        status: 'error',
        errorCode: code,
      });
      return {
        content: [{
          type: 'text' as const,
          text: `Grafana 查询失败：${error instanceof Error ? error.message : '未知错误'}\ntrace_id: ${traceId}`,
        }],
        isError: true,
      };
    }
  }

  async close(): Promise<void> {
    await this.client?.close();
  }
}

export function enforceGrafanaBounds(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const args = structuredClone(input) as Record<string, unknown>;

  for (const key of ['limit', 'maxLines', 'max_lines']) {
    if (typeof args[key] === 'number') args[key] = Math.min(args[key], 1_000);
  }

  const start = findTime(args, ['start', 'from', 'startTime', 'start_time']);
  const end = findTime(args, ['end', 'to', 'endTime', 'end_time']) ?? Date.now();
  if (start !== undefined) {
    if (end < start) throw new GrafanaPolicyError('INVALID_TIME_RANGE', '开始时间不能晚于结束时间');
    if (end - start > config.maxLookbackHours * 3_600_000) {
      throw new GrafanaPolicyError('TIME_RANGE_TOO_LARGE', `Grafana 查询范围不能超过 ${config.maxLookbackHours} 小时`);
    }
  }
  return args;
}

function findTime(args: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'number') {
      return value > 10_000_000_000 ? value : value * 1_000;
    }
    if (typeof value === 'string') {
      const relative = /^now-(\d+)([mhd])$/.exec(value);
      if (relative) {
        const unit = relative[2] === 'm' ? 60_000 : relative[2] === 'h' ? 3_600_000 : 86_400_000;
        return Date.now() - Number(relative[1]) * unit;
      }
      if (value === 'now') return Date.now();
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return undefined;
}

class GrafanaPolicyError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
