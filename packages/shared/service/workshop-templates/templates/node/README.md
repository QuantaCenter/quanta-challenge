# Node.js + Express

运行在 WebContainer 中的 Node.js 服务，监听 3000 端口，修改代码后自动重启（`node --watch`）。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/todos` | 获取待办列表 |
| POST | `/api/todos` | 新增待办，请求体 `{ "text": "..." }` |
| DELETE | `/api/todos/:id` | 删除待办 |

## 提示

- `public/index.html` 是一个调用上述接口的小页面，可以在预览区直接体验
- 也可以在终端里用 `curl http://localhost:3000/api/todos` 调试
