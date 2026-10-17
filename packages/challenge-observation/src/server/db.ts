import { DatabaseSync } from 'node:sqlite'
import { config } from './config.ts'

// Node 24 内置 SQLite，WAL 模式
export const db = new DatabaseSync(config.dbPath)

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS alert_records (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint       TEXT NOT NULL UNIQUE,
  alertname         TEXT NOT NULL DEFAULT 'unknown',
  status            TEXT NOT NULL DEFAULT 'firing',
  severity          TEXT NOT NULL DEFAULT 'info',
  labels_json       TEXT NOT NULL DEFAULT '{}',
  annotations_json  TEXT NOT NULL DEFAULT '{}',
  starts_at         TEXT,
  ends_at           TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_alert_records_status ON alert_records (status, updated_at);

CREATE TABLE IF NOT EXISTS alert_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_record_id INTEGER NOT NULL REFERENCES alert_records (id),
  status          TEXT NOT NULL,
  message         TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_alert_events_record ON alert_events (alert_record_id, created_at);
`)

// ---------- 业务配置（KV） ----------

export function getAllConfig(): Record<string, unknown> {
   const rows = db.prepare('SELECT key, value FROM app_config').all() as Array<{ key: string, value: string }>
   return Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]))
}

export function getConfigValue(key: string): unknown {
   const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as { value: string } | undefined
   return row ? JSON.parse(row.value) : undefined
}

export function setConfigValue(key: string, value: unknown): void {
   db.prepare(`
     INSERT INTO app_config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
   `).run(key, JSON.stringify(value))
}

// ---------- 告警记录（Grafana webhook 写入） ----------

export interface AlertRecord {
   id: number
   fingerprint: string
   alertname: string
   status: 'firing' | 'resolved'
   severity: string
   labels: Record<string, string>
   annotations: Record<string, string>
   starts_at: string | null
   ends_at: string | null
   updated_at: string
}

function toRecord(row: Record<string, unknown>): AlertRecord {
   return {
      id: Number(row.id),
      fingerprint: String(row.fingerprint),
      alertname: String(row.alertname),
      status: row.status as AlertRecord['status'],
      severity: String(row.severity),
      labels: JSON.parse(String(row.labels_json)),
      annotations: JSON.parse(String(row.annotations_json)),
      starts_at: (row.starts_at as string) ?? null,
      ends_at: (row.ends_at as string) ?? null,
      updated_at: String(row.updated_at),
   }
}

export function upsertAlert(input: {
   fingerprint: string
   alertname: string
   status: 'firing' | 'resolved'
   severity: string
   labels: Record<string, string>
   annotations: Record<string, string>
   startsAt?: string | null
   endsAt?: string | null
}): number {
   const row = db.prepare('SELECT id FROM alert_records WHERE fingerprint = ?').get(input.fingerprint) as
      | { id: number }
      | undefined

   if (row) {
      db.prepare(`
        UPDATE alert_records
        SET status = ?, severity = ?, labels_json = ?, annotations_json = ?,
            starts_at = COALESCE(?, starts_at), ends_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?
      `).run(
         input.status,
         input.severity,
         JSON.stringify(input.labels ?? {}),
         JSON.stringify(input.annotations ?? {}),
         input.startsAt ?? null,
         input.endsAt ?? null,
         row.id,
      )
      return row.id
   }

   const result = db.prepare(`
     INSERT INTO alert_records (fingerprint, alertname, status, severity, labels_json, annotations_json, starts_at, ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   `).run(
      input.fingerprint,
      input.alertname,
      input.status,
      input.severity,
      JSON.stringify(input.labels ?? {}),
      JSON.stringify(input.annotations ?? {}),
      input.startsAt ?? null,
      input.endsAt ?? null,
   )
   return Number(result.lastInsertRowid)
}

export function insertAlertEvent(alertRecordId: number, status: string, message: string): void {
   db.prepare('INSERT INTO alert_events (alert_record_id, status, message) VALUES (?, ?, ?)')
      .run(alertRecordId, status, message)
}

export function listAlerts(limit: number): AlertRecord[] {
   const rows = db
      .prepare('SELECT * FROM alert_records ORDER BY updated_at DESC LIMIT ?')
      .all(Math.min(Math.max(limit, 1), 500)) as Array<Record<string, unknown>>
   return rows.map(toRecord)
}

export function getAlert(id: number): AlertRecord | undefined {
   const row = db.prepare('SELECT * FROM alert_records WHERE id = ?').get(id) as Record<string, unknown> | undefined
   return row ? toRecord(row) : undefined
}

export function listAlertEvents(alertRecordId: number, limit = 100): Array<{ id: number, status: string, message: string, created_at: string }> {
   return db
      .prepare('SELECT id, status, message, created_at FROM alert_events WHERE alert_record_id = ? ORDER BY id DESC LIMIT ?')
      .all(alertRecordId, Math.min(Math.max(limit, 1), 500)) as Array<{ id: number, status: string, message: string, created_at: string }>
}
