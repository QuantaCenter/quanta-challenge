import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';
import { redactValue } from '../security/redaction';

export interface AuditEvent {
  traceId?: string;
  caller: string;
  tool: string;
  arguments?: unknown;
  query?: string;
  startedAt: number;
  status: 'success' | 'error';
  rowCount?: number;
  errorCode?: string;
}

const { DatabaseSync } = process.getBuiltinModule('node:sqlite');

export class AuditStore {
  private readonly db: SqliteDatabase;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS tool_audit (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        caller TEXT NOT NULL,
        tool TEXT NOT NULL,
        args_json TEXT,
        query_sha256 TEXT,
        started_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        row_count INTEGER,
        error_code TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tool_audit_started_at ON tool_audit(started_at);
      CREATE INDEX IF NOT EXISTS idx_tool_audit_caller ON tool_audit(caller, started_at);
    `);
  }

  record(event: AuditEvent): string {
    const traceId = event.traceId ?? randomUUID();
    const payload = {
      traceId,
      caller: event.caller,
      tool: event.tool,
      durationMs: Date.now() - event.startedAt,
      status: event.status,
      rowCount: event.rowCount,
      errorCode: event.errorCode,
    };
    this.db.prepare(`
      INSERT INTO tool_audit
        (id, trace_id, caller, tool, args_json, query_sha256, started_at, duration_ms, status, row_count, error_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      traceId,
      event.caller,
      event.tool,
      event.arguments === undefined ? null : JSON.stringify(redactValue(event.arguments)),
      event.query ? createHash('sha256').update(event.query).digest('hex') : null,
      new Date(event.startedAt).toISOString(),
      payload.durationMs,
      event.status,
      event.rowCount ?? null,
      event.errorCode ?? null,
    );
    console.log(JSON.stringify({ event: 'data_mcp_tool_call', ...payload }));
    return traceId;
  }

  close(): void {
    this.db.close();
  }
}
