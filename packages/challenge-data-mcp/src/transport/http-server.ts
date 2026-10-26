import { createServer, type Server as HttpServer } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
  type McpServerFactory,
} from '@modelcontextprotocol/server';
import { config } from '../config/index';
import type { GrafanaProxy } from '../grafana/proxy';
import { authenticate, unauthorized } from '../security/bearer-auth';

export interface HttpTransportDependencies {
  createMcpServer: McpServerFactory;
  grafana: GrafanaProxy;
}

export function startHttpTransport({
  createMcpServer,
  grafana,
}: HttpTransportDependencies): HttpServer {
  const handler = createMcpHandler(createMcpServer, {
    legacy: 'stateless',
    responseMode: 'auto',
    onerror: (error) => logError('mcp_handler_error', error),
  });
  const nodeHandler = toNodeHandler(handler, {
    maxRequestBodySize: 1_048_576,
    onerror: (error) => logError('mcp_node_error', error),
  });

  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
      if (path === '/healthz' && req.method === 'GET') {
        sendResponse(res, Response.json({
          status: grafana.connected ? 'ok' : 'degraded',
          database: 'configured',
          grafana: grafana.connected,
        }));
        return;
      }
      if (path !== '/mcp') {
        sendResponse(res, Response.json({ error: 'not_found' }, { status: 404 }));
        return;
      }

      const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/mcp'}`, {
        method: 'GET',
        headers: req.headers as HeadersInit,
      });
      const hostRejected = hostHeaderValidationResponse(request, config.allowedHosts);
      if (hostRejected) return sendResponse(res, hostRejected);
      const originRejected = originValidationResponse(request, config.allowedOrigins);
      if (originRejected) return sendResponse(res, originRejected);

      const authInfo = authenticate(req.headers.authorization, config.bearerTokens);
      if (!authInfo) return sendResponse(res, unauthorized());
      (req as typeof req & { auth: typeof authInfo }).auth = authInfo;
      await nodeHandler(req, res);
    } catch (error) {
      logError('http_error', error);
      if (!res.headersSent) {
        sendResponse(res, Response.json({ error: 'internal_error' }, { status: 500 }));
      }
    }
  });

  server.listen(config.port, config.host, () => {
    console.log(JSON.stringify({ event: 'data_mcp_started', host: config.host, port: config.port }));
  });
  return server;
}

function sendResponse(res: import('node:http').ServerResponse, response: Response): void {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  void response.arrayBuffer().then((body) => res.end(Buffer.from(body)));
}

function logError(event: string, error: unknown): void {
  console.error(JSON.stringify({
    event,
    message: error instanceof Error ? error.message : String(error),
  }));
}
