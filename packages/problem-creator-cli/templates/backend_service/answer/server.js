import { createServer } from 'node:http';

// 参考解：零依赖的 node:http 服务；改完在 answer/ 跑 pnpm install --lockfile-only，让锁文件与 package.json 一致。
const items = [];
let nextId = 1;

const sendJson = (res, status, body) => {
   const payload = JSON.stringify(body);
   res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
   });
   res.end(payload);
};

const readJson = (req) =>
   new Promise((resolve) => {
      let raw = '';
      req.on('data', (chunk) => {
         raw += chunk;
      });
      req.on('end', () => {
         try {
            resolve(raw ? JSON.parse(raw) : {});
         } catch {
            resolve(undefined);
         }
      });
   });

const server = createServer(async (req, res) => {
   const url = new URL(req.url ?? '/', 'http://localhost');

   if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true });
   }

   if (req.method === 'GET' && url.pathname === '/items') {
      return sendJson(res, 200, { items });
   }

   if (req.method === 'POST' && url.pathname === '/items') {
      const body = await readJson(req);
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title) {
         return sendJson(res, 400, { error: 'title_required' });
      }
      const item = { id: nextId, title };
      nextId += 1;
      items.push(item);
      return sendJson(res, 201, { item });
   }

   return sendJson(res, 404, { error: 'not_found' });
});

// 端口从环境变量注入：编辑器与判题容器都会传 PORT / QUANTA_PORT。
const port = Number(process.env.PORT || process.env.QUANTA_PORT || 3000);
server.listen(port, () => {
   console.log('todo-api listening on ' + port);
});
