# @challenge/backend-judge-machine-agent

后端服务题型的判题服务。与 `judge-machine`（前端题型，Playwright + DOM）并列，
**不装浏览器**：它在 VM2 沙箱里运行判题脚本，脚本用受约束的 HTTP 客户端访问用户的
后端服务，再断言响应。

## 它怎么被用起来

调度器在跑后端任务时会：

1. 启动后端服务容器（`challenge-backend-service-agent`），等它打印 `Ready`；
2. 懒加载本判题机容器，通过 `ws://<host>:1891/link` 连上（与前端判题机的 1889 分开）；
3. 发任务：

```json
{
  "judgeRecordId": 123,
  "judgeScript": "export default defineTestHandler(async ({ http, $ }) => { ... })",
  "mode": "judge",
  "url": "http://<snapshot-alias>:3000"
}
```

4. 收到 JRTP 打包的结果（形状与前端判题机完全一致）。

## 判题脚本 API

```js
export default defineTestHandler(async ({ http, $ }) => {
   $.defineCheckPoint('GET /health 返回 ok', 10, async () => {
      const res = await http.get('/health');
      $.expect(res.status === 200, `期望 200，实际 ${res.status}`);
      $.expect(res.json.ok === true, 'body.ok 应为 true');
      return 10; // ← 必须 return，否则该检查点记 0 分（与前端题型同一个坑）
   });
});
```

`http`：

| 方法 | 说明 |
|---|---|
| `http.get(path, options?)` | `path` 相对 `url` 解析 |
| `http.post/put/patch/delete(path, body?, options?)` | `body` 为对象时自动 JSON |
| `options.headers` / `options.timeoutMs` | 覆盖单请求超时（默认 10s） |
| 返回 `{ status, headers, text, buffer, json }` | `json` 仅在 content-type 为 JSON 时存在 |

沙箱约束：

- **同源白名单**：绝对 URL 必须与 `url` 同源，否则拒绝（防止拿判题机做 SSRF）。
- **响应体上限** 2MB（`BACKEND_JUDGE_MAX_RESPONSE_BYTES`）。
- **脚本预算** 20s（`BACKEND_JUDGE_SCRIPT_BUDGET_MS`），必须小于调度器的 30s。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `BACKEND_JUDGE_REQUEST_TIMEOUT_MS` | 10000 | 单请求超时 |
| `BACKEND_JUDGE_MAX_RESPONSE_BYTES` | 2097152 | 单响应体上限 |
| `BACKEND_JUDGE_SCRIPT_BUDGET_MS` | 20000 | 整个脚本预算 |

## 构建

```bash
pnpm --filter @challenge/backend-judge-machine-agent docker:build
```

详见 `docs/BACKEND_SERVICE_PROBLEM.md`。
