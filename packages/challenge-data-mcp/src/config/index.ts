import { z } from 'zod';

const envSchema = z.object({
  DATA_MCP_HOST: z.string().default('127.0.0.1'),
  DATA_MCP_PORT: z.coerce.number().int().min(1).max(65535).default(9320),
  DATA_MCP_PUBLIC_URL: z.url().default('http://127.0.0.1:9320/mcp'),
  DATA_MCP_BEARER_TOKENS: z.string().min(1),
  DATA_MCP_DATABASE_URL: z.string().min(1),
  GRAFANA_MCP_URL: z.url().default('http://grafana-mcp:8000/mcp'),
  DATA_MCP_AUDIT_DB_PATH: z.string().default('/data/audit.sqlite3'),
  DATA_MCP_ALLOWED_HOSTS: z.string().default('localhost,127.0.0.1,data-mcp'),
  DATA_MCP_ALLOWED_ORIGINS: z.string().default('localhost,127.0.0.1'),
  DATA_MCP_QUERY_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(5_000),
  DATA_MCP_LOCK_TIMEOUT_MS: z.coerce.number().int().min(50).max(5_000).default(1_000),
  DATA_MCP_MAX_ROWS: z.coerce.number().int().min(1).max(1_000).default(200),
  DATA_MCP_MAX_RESULT_BYTES: z.coerce.number().int().min(1_024).max(5_000_000).default(512_000),
  DATA_MCP_MAX_LOOKBACK_HOURS: z.coerce.number().int().min(1).max(8_760).default(720),
});

const env = envSchema.parse(process.env);

export const config = {
  host: env.DATA_MCP_HOST,
  port: env.DATA_MCP_PORT,
  publicUrl: new URL(env.DATA_MCP_PUBLIC_URL),
  bearerTokens: parseTokens(env.DATA_MCP_BEARER_TOKENS),
  databaseUrl: env.DATA_MCP_DATABASE_URL,
  grafanaMcpUrl: new URL(env.GRAFANA_MCP_URL),
  auditDbPath: env.DATA_MCP_AUDIT_DB_PATH,
  allowedHosts: splitList(env.DATA_MCP_ALLOWED_HOSTS),
  allowedOrigins: splitList(env.DATA_MCP_ALLOWED_ORIGINS),
  queryTimeoutMs: env.DATA_MCP_QUERY_TIMEOUT_MS,
  lockTimeoutMs: env.DATA_MCP_LOCK_TIMEOUT_MS,
  maxRows: env.DATA_MCP_MAX_ROWS,
  maxResultBytes: env.DATA_MCP_MAX_RESULT_BYTES,
  maxLookbackHours: env.DATA_MCP_MAX_LOOKBACK_HOURS,
};

function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseTokens(value: string): ReadonlyMap<string, string> {
  const entries = value.split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
    const separator = item.indexOf(':');
    if (separator < 1 || separator === item.length - 1) {
      throw new Error('DATA_MCP_BEARER_TOKENS 格式应为 caller:token，可用逗号分隔多个值');
    }
    return [item.slice(0, separator), item.slice(separator + 1)] as const;
  });
  return new Map(entries);
}
