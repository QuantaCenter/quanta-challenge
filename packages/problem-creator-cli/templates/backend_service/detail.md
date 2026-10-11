# {{title}}

用 Node.js 写一个**待办清单 HTTP API**：进程必须监听 **3000** 端口，启动后对外提供下面的接口。

> 本题不要求任何第三方依赖，用 Node 内置的 `node:http` 就够；想用 Express/Fastify
> 也行，记得同步 `template/` 与 `answer/` 的依赖和锁文件（见 README）。

## 接口要求

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 返回 `200` 与 `{ "ok": true }` |
| GET | `/items` | 返回全部待办：`{ "items": [{ "id": 1, "title": "写题" }] }`，初始为空 |
| POST | `/items` | 新建待办，请求体 `{ "title": "写题" }` |

约定：

- `POST /items` 成功返回 **201**，响应体为 `{ "item": { "id": 1, "title": "写题" } }`，`id` 从 `1` 开始自增。
- `title` 为空或缺失时返回 **400**，且不创建。
- 请求与响应都是 JSON。

## 怎么自己验证

判题机不发浏览器请求，只用 HTTP 断言。你可以在预览面板的终端里自己 curl：

```bash
curl -s localhost:3000/health
curl -s -X POST localhost:3000/items -H 'content-type: application/json' -d '{"title":"写题"}'
curl -s localhost:3000/items
```
