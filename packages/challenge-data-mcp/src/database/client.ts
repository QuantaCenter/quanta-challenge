import { Pool, type QueryResultRow } from 'pg';
import { config } from '../config/index';
import { boundedJson, redactValue } from '../security/redaction';
import { validateReadOnlySql } from './sql-policy';

export type SqlParameter = string | number | boolean | null;

export interface DataResult {
  rows: QueryResultRow[];
  rowCount: number;
  truncated: boolean;
  text: string;
}

export class ReadOnlyDatabase {
  private readonly pool = new Pool({
    connectionString: config.databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'challenge-data-mcp',
  });

  async query(sqlInput: string, parameters: SqlParameter[] = []): Promise<DataResult> {
    const { sql } = validateReadOnlySql(sqlInput);
    return this.execute(sql, parameters);
  }

  async semanticQuery(sql: string, parameters: SqlParameter[]): Promise<DataResult> {
    return this.execute(sql, parameters);
  }

  private async execute(sql: string, parameters: SqlParameter[]): Promise<DataResult> {
    if (parameters.length > 50) throw new Error('参数数量超过 50 个');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query(`SET LOCAL statement_timeout = '${config.queryTimeoutMs}ms'`);
      await client.query(`SET LOCAL lock_timeout = '${config.lockTimeoutMs}ms'`);
      await client.query(`SET LOCAL search_path = agent_read, pg_catalog`);
      const wrapped = `SELECT * FROM (${sql}) AS data_mcp_result LIMIT ${config.maxRows + 1}`;
      const result = await client.query(wrapped, parameters);
      await client.query('COMMIT');
      const truncated = result.rows.length > config.maxRows;
      const rows = result.rows.slice(0, config.maxRows).map((row) => redactValue(row) as QueryResultRow);
      return {
        rows,
        rowCount: rows.length,
        truncated,
        text: boundedJson(
          {
            rowCount: rows.length,
            truncated,
            rows,
            note: truncated ? `结果超过 ${config.maxRows} 行，已截断` : undefined,
          },
          config.maxResultBytes,
        ),
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
