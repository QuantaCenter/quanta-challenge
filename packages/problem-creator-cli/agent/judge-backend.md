# 如何编写后端 Judge 脚本（type: backend_service）

## 骨架

```js
export default defineTestHandler(async ({ http, $ }) => {
   $.defineCheckPoint('GET /health 返回 ok', 5, async () => {
      const res = await http.get('/health');
      $.expect(res.status === 200, '期望 /health 返回 200，实际为 ' + res.status);
      $.expect(res.json && res.json.ok === true, '期望 body.ok 为 true，实际为 ' + res.text);
      return 5; // 必须 return 本检查点得分
   });
});
```

- 必须是 `export default defineTestHandler(...)`，不要有其它 `export`，不要 import。
- 后端题拿到的是 `http`，**没有** `page`。

## 运行时事实（线上判题机）

| 事实 | 后果 / 做法 |
| --- | --- |
| 容器里在工程目录执行 `npm start`（入口写在 `package.json` 的 `scripts.start`），端口由 `PORT` / `QUANTA_PORT` 注入，等于配置的 `runtime.servicePort`（默认 3000） | 服务必须 `listen(process.env.PORT \|\| 3000)` |
| 依赖在**断网**环境按 `pnpm-lock.yaml` 离线安装 | `answer/`、`template/` 都要有与 `package.json` 一致的锁文件（RUN003）；加依赖后在对应目录 `pnpm install` |
| 服务起来后才开始执行脚本；**整个脚本总预算 20 秒**，超时所有检查点作废 | 不要做压测式的大量请求 |
| 单个请求超时 10 秒（可用 `timeoutMs` 调小），响应体上限 2MB | 慢接口单独设 `{ timeoutMs: 3000 }`，快速失败 |
| 只能请求被测服务本身（同源），`http.get('/x')` 的路径相对服务根 | 不能访问外网 |
| 检查点**按定义顺序串行**，共用同一个服务进程，**中间不重启** | 前面创建的数据后面能读到；设计检查点时要考虑顺序，或让每个检查点用独立的数据 |
| 返回值即得分；不 return 记 0 分；`$.expect` 同步抛错只影响本检查点；顶层异常让整个脚本失败 | 同前端 |
| 沙箱里**没有** `setTimeout` / `fetch` / `URL` / `require` / `process` | 只用 `http` 和 `$` |
| `res.json` 只在响应 `content-type` 含 `json` 且能解析时才有值 | 断言前先判 `res.json` 是否存在；失败消息里带上 `res.text` |

## http 客户端

```ts
http.get(path, options?)
http.post(path, body?, options?)
http.put(path, body?, options?)
http.patch(path, body?, options?)
http.delete(path, body?, options?)   // 注意：第二个参数是 body；只传 headers 时写 http.delete(p, undefined, { headers })
// options: { headers?: Record<string, string>; timeoutMs?: number }
// body 为对象时自动 JSON.stringify 并补 content-type: application/json；字符串原样发送
// 返回 { status, headers, text, buffer, json }
```

## 编写规范

1. **每个接口要求一个检查点**：状态码、响应结构、边界情况（缺字段返回 400、资源不存在返回 404）分开给分，题面里逐条写清。
2. **断言消息**带上实际值：`'期望 201，实际为 ' + res.status + '，响应体 ' + res.text`。
3. **不要依赖实现细节**：只验证接口契约（方法、路径、状态码、JSON 结构），不检查用了什么框架。
4. **顺序依赖要显式**：例如"先 POST 再 GET 能读到"，就写在同一个检查点里，或在题面里说明初始数据。
5. **id 不要硬编码**：用 POST 返回的 `item.id` 去拼后续请求路径。
6. `$.save(content, name?)` 可把响应内容存为附件，方便在判题详情里排查（本地无效果）。

## 常用片段

```js
const expectJson = (res, label) => {
   $.expect(res.json !== undefined, label + ' 期望返回 JSON，实际 content-type 为 ' + res.headers['content-type'] + '，响应体 ' + res.text);
   return res.json;
};

$.defineCheckPoint('POST /items 缺少 title 返回 400', 5, async () => {
   const res = await http.post('/items', {});
   $.expect(res.status === 400, '缺少 title 时期望 400，实际为 ' + res.status);
   return 5;
});

$.defineCheckPoint('DELETE /items/:id 删除后 GET 返回 404', 10, async () => {
   const created = expectJson(await http.post('/items', { title: '临时' }), 'POST /items');
   const id = created.item && created.item.id;
   const del = await http.delete('/items/' + id);
   $.expect(del.status === 204 || del.status === 200, '删除期望 200/204，实际为 ' + del.status);
   const res = await http.get('/items/' + id);
   $.expect(res.status === 404, '删除后再查期望 404，实际为 ' + res.status);
   return 10;
});
```

## 本地验证

`qpc check` 会在 `answer/`、`template/` 下各执行一次 `npm start`（`PORT` 注入），用与线上相同的 `http` 客户端跑脚本。工程声明了第三方依赖时需先在对应目录 `pnpm install`。
