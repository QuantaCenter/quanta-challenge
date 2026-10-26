import { AuditStore } from './audit/sqlite-audit-store';
import { config } from './config/index';
import { ReadOnlyDatabase } from './database/client';
import { GrafanaProxy } from './grafana/proxy';
import { createDataMcpServer } from './mcp/create-server';
import { startHttpTransport } from './transport/http-server';

const database = new ReadOnlyDatabase();
const audit = new AuditStore(config.auditDbPath);
const grafana = new GrafanaProxy();

const httpServer = startHttpTransport({
  createMcpServer: () => createDataMcpServer({ database, audit, grafana }),
  grafana,
});

void connectGrafana();

async function connectGrafana(): Promise<void> {
  try {
    await grafana.connect();
    console.log(JSON.stringify({ event: 'grafana_mcp_connected', url: config.grafanaMcpUrl.origin }));
  } catch (error) {
    console.error(JSON.stringify({
      event: 'grafana_mcp_unavailable',
      message: error instanceof Error ? error.message : String(error),
    }));
    setTimeout(() => void connectGrafana(), 30_000).unref();
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({ event: 'data_mcp_stopping', signal }));
  httpServer.close();
  await Promise.allSettled([database.close(), grafana.close()]);
  audit.close();
  process.exit(0);
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
