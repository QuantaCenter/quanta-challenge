import { createServer } from 'node:http';

// 答案模板：实现待办清单 HTTP API（GET /health → 200 {ok:true}；GET /items → 200 {items:[]}；POST /items → 201 {item}，title 为空 400），改完用 curl 自验。
const sendJson = (res, status, body) => {
   const payload = JSON.stringify(body);
   res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
   });
   res.end(payload);
};

const server = createServer((req, res) => {
   const url = new URL(req.url ?? '/', 'http://localhost');

   if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true });
   }

   // TODO: 实现 GET /items 与 POST /items

   return sendJson(res, 404, { error: 'not_found' });
});

const port = Number(process.env.PORT || process.env.QUANTA_PORT || 3000);
server.listen(port, () => {
   console.log('todo-api listening on ' + port);
});
