import nodeSqlParser from 'node-sql-parser';

const parser = new nodeSqlParser.Parser();

export const ALLOWED_VIEWS = new Set([
  'users',
  'problems',
  'judge_records',
  'judge_status',
  'daily_checkins',
  'user_statistics',
  'cloud_function_invocations',
  'webauthn_summary',
]);

const FORBIDDEN_FUNCTIONS = new Set([
  'pg_sleep',
  'pg_read_file',
  'pg_read_binary_file',
  'pg_ls_dir',
  'pg_stat_file',
  'lo_export',
  'dblink',
  'dblink_exec',
  'set_config',
]);

export interface ValidatedSql {
  sql: string;
  tables: string[];
}

export function validateReadOnlySql(input: string): ValidatedSql {
  const sql = input.trim().replace(/;+\s*$/, '');
  if (!sql) throw new SqlPolicyError('EMPTY_QUERY', 'SQL 不能为空');
  if (Buffer.byteLength(sql) > 20_000) {
    throw new SqlPolicyError('QUERY_TOO_LARGE', 'SQL 超过 20KB 限制');
  }
  if (/for\s+(update|share|no\s+key\s+update|key\s+share)/i.test(sql)) {
    throw new SqlPolicyError('LOCK_NOT_ALLOWED', '不允许锁定读取');
  }
  if (/\b(insert|update|delete|replace|create|drop|alter|truncate|copy|call|grant|revoke)\b/i.test(sql)) {
    throw new SqlPolicyError('NOT_READ_ONLY', 'SQL 中包含写入或管理语句');
  }

  let ast: unknown;
  try {
    ast = parser.astify(sql, { database: 'Postgresql' });
  } catch {
    throw new SqlPolicyError('INVALID_SQL', 'SQL 无法按 PostgreSQL 语法解析');
  }
  if (Array.isArray(ast)) {
    throw new SqlPolicyError('MULTIPLE_STATEMENTS', '只允许单条 SQL');
  }
  if (!isSelectTree(ast)) {
    throw new SqlPolicyError('NOT_READ_ONLY', '仅允许 SELECT 或 WITH ... SELECT');
  }
  const cteNames = collectCteNames(ast);

  const serialized = JSON.stringify(ast).toLowerCase();
  if (/"type":"(insert|update|delete|replace|create|drop|alter|truncate|copy|call)"/.test(serialized)) {
    throw new SqlPolicyError('NOT_READ_ONLY', 'CTE 和子查询中也只能包含 SELECT');
  }
  if (/\bselect\b[\s\S]*\binto\b/i.test(sql)) {
    throw new SqlPolicyError('SELECT_INTO_NOT_ALLOWED', '不允许 SELECT INTO');
  }
  for (const fn of FORBIDDEN_FUNCTIONS) {
    if (serialized.includes(`"${fn}"`)) {
      throw new SqlPolicyError('FORBIDDEN_FUNCTION', `禁止调用函数 ${fn}`);
    }
  }
  if (/"locking_read"\s*:\s*true/.test(serialized)) {
    throw new SqlPolicyError('LOCK_NOT_ALLOWED', '不允许锁定读取');
  }

  let tableEntries: string[];
  try {
    tableEntries = parser.tableList(sql, { database: 'Postgresql' });
  } catch {
    throw new SqlPolicyError('INVALID_TABLE_REFERENCE', '无法验证 SQL 中的表引用');
  }
  const tables = tableEntries
    .map(parseTableEntry)
    .filter((table) => !(table.schema === 'null' && cteNames.has(table.name)));
  if (tables.length === 0) {
    throw new SqlPolicyError('TABLE_REQUIRED', '查询必须引用 agent_read 中的视图');
  }
  for (const table of tables) {
    if (table.schema !== 'agent_read' || !ALLOWED_VIEWS.has(table.name)) {
      throw new SqlPolicyError(
        'TABLE_NOT_ALLOWED',
        `只允许查询 agent_read 白名单视图，拒绝 ${table.schema}.${table.name}`,
      );
    }
  }

  return { sql, tables: [...new Set(tables.map(({ name }) => name))] };
}

function isSelectTree(ast: unknown): boolean {
  if (!ast || typeof ast !== 'object') return false;
  const type = (ast as { type?: unknown }).type;
  return type === 'select';
}

function collectCteNames(ast: unknown, names = new Set<string>()): Set<string> {
  if (!ast || typeof ast !== 'object') return names;
  if (Array.isArray(ast)) {
    for (const child of ast) collectCteNames(child, names);
    return names;
  }
  const record = ast as Record<string, unknown>;
  if (Array.isArray(record.with)) {
    for (const cte of record.with) {
      const value = (cte as { name?: { value?: unknown } }).name?.value;
      if (typeof value === 'string') names.add(value.toLowerCase());
    }
  }
  for (const value of Object.values(record)) collectCteNames(value, names);
  return names;
}

function parseTableEntry(entry: string): { schema: string; name: string } {
  const parts = entry.split('::');
  const schema = parts.at(-2) || '';
  const name = parts.at(-1) || '';
  return { schema: schema.toLowerCase(), name: name.toLowerCase() };
}

export class SqlPolicyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SqlPolicyError';
  }
}
