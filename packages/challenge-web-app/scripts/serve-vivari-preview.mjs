import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-vivari-preview');
const port = Number(process.env.PORT || 3001);
const files = new Map([
   ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
   ['/__vv-bridge.html', ['__vv-bridge.html', 'text/html; charset=utf-8']],
   ['/__vv-preview-boot.html', ['__vv-preview-boot.html', 'text/html; charset=utf-8']],
]);

createServer(async (request, response) => {
   const pathname = new URL(request.url || '/', 'http://preview.local').pathname;
   if (pathname === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      response.end('ok');
      return;
   }
   const selected = files.get(pathname) || (pathname.startsWith('/preview/')
      ? files.get('/__vv-preview-boot.html') : undefined);
   if (!selected) {
      response.writeHead(404, { 'Cache-Control': 'no-store' });
      response.end('Not found');
      return;
   }
   try {
      const bytes = await readFile(join(root, selected[0]));
      response.writeHead(200, {
         'Content-Type': selected[1],
         'Content-Length': bytes.byteLength,
         'Cache-Control': 'no-store',
         'Cross-Origin-Embedder-Policy': 'credentialless',
         'Cross-Origin-Resource-Policy': 'cross-origin',
         ...(pathname === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}),
      });
      response.end(bytes);
   } catch {
      response.writeHead(503, { 'Cache-Control': 'no-store' });
      response.end('Vivari preview assets are unavailable');
   }
}).listen(port, '0.0.0.0');
