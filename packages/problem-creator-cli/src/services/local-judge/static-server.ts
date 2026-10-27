import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';

const MIME: Record<string, string> = {
   '.html': 'text/html; charset=utf-8',
   '.htm': 'text/html; charset=utf-8',
   '.js': 'text/javascript; charset=utf-8',
   '.mjs': 'text/javascript; charset=utf-8',
   '.css': 'text/css; charset=utf-8',
   '.json': 'application/json; charset=utf-8',
   '.svg': 'image/svg+xml',
   '.png': 'image/png',
   '.jpg': 'image/jpeg',
   '.jpeg': 'image/jpeg',
   '.gif': 'image/gif',
   '.webp': 'image/webp',
   '.ico': 'image/x-icon',
   '.txt': 'text/plain; charset=utf-8',
   '.woff': 'font/woff',
   '.woff2': 'font/woff2',
};

export interface StaticSite {
   url: string;
   close: () => Promise<void>;
}

/** 本地静态站点：替代判题容器里的 live-server（站点根 = 题目的 template / answer 目录）。 */
export const startStaticServer = async (root: string): Promise<StaticSite> => {
   const base = normalize(root.endsWith(sep) ? root : `${root}${sep}`);
   const server = createServer(async (req, res) => {
      try {
         const pathname = decodeURIComponent(
            new URL(req.url ?? '/', 'http://localhost').pathname,
         );
         let file = normalize(join(base, pathname));
         if (!file.startsWith(base) && `${file}${sep}` !== base) {
            res.writeHead(403).end();
            return;
         }
         const info = await stat(file).catch(() => undefined);
         if (info?.isDirectory()) file = join(file, 'index.html');
         const target = await stat(file).catch(() => undefined);
         if (!target?.isFile()) {
            res.writeHead(404, { 'content-type': 'text/plain' }).end(
               'Not Found',
            );
            return;
         }
         res.writeHead(200, {
            'content-type':
               MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
            'cache-control': 'no-store',
         });
         createReadStream(file).pipe(res);
      } catch {
         res.writeHead(500).end();
      }
   });
   await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
   });
   const { port } = server.address() as AddressInfo;
   return {
      url: `http://127.0.0.1:${port}/`,
      close: () =>
         new Promise((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
         }),
   };
};
