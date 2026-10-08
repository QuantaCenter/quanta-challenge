# 云函数编写指南（面向管理员）

云函数是平台的可扩展点：管理员发布一小段 TS/JS，成员或内部服务通过 HTTP 调用。
只有**管理员**能发布，成员只能调用。

> 设计背景、鉴权与 KV 隔离的实现细节见 [`../DESIGN.md`](../DESIGN.md)。

## 1. 最小示例

```ts
export default async function (ctx) {
   const hits = await ctx.kv.incr('hits', 1);
   return { hits, user: ctx.user?.name ?? 'anonymous' };
}
```

规则：

- 用 `export default` 导出一个函数（也兼容 `export function handler(ctx)`）。
- 返回任意 JSON 可序列化值；返回值大小受函数配置的 `maxResponseBytes` 限制。
- **只能单文件**：不能用相对路径 import 别的文件，更不能 import node 内置模块或 npm 包。
  需要外部能力时，应推动平台在 `ctx` 上提供受控能力，而不是绕过沙箱。

## 2. `ctx` 能力总览

```ts
interface CloudFunctionContext {
   /** 调用方传入的输入（JSON），只读。 */
   readonly input: unknown;

   /** 调用者身份；无用户（如系统/判题调用）时为 null。 */
   readonly user: { id: string; name: string; role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' } | null;

   /** 受限 KV，见第 3 节。 */
   readonly kv: CloudFunctionKV;

   /** 结构化日志，自动带上 traceId / 函数名与版本。 */
   readonly log: {
      debug(msg: string, data?: Record<string, unknown>): void;
      info(msg: string, data?: Record<string, unknown>): void;
      warn(msg: string, data?: Record<string, unknown>): void;
      error(msg: string, data?: Record<string, unknown>): void;
   };

   readonly fn: { name: string; version: number };

   /** 无用户时抛 INVALID_INPUT。 */
   requireUser(): { id: string; name: string; role: string };

   /** 校验 input 是对象且包含指定字段，否则抛 INVALID_INPUT。 */
   requireInput<T extends Record<string, unknown>>(keys: string[]): T;
}
```

**没有** `fetch` / `require` / `process` / `fs` / `setTimeout` / `eval` / 环境变量。
这是刻意为之（见第 5 节）。

## 3. 受限 KV

```ts
interface CloudFunctionKV {
   get<T = unknown>(key: string): Promise<T | null>;
   set(key: string, value: unknown, opts?: { ttlSeconds?: number }): Promise<void>;
   del(key: string): Promise<boolean>;
   has(key: string): Promise<boolean>;
   incr(key: string, by?: number): Promise<number>;
   expire(key: string, ttlSeconds: number): Promise<boolean>;
   ttl(key: string): Promise<number>;
   keys(pattern?: string): Promise<string[]>; // 最多返回 scanLimit 条
   mget<T = unknown>(keys: string[]): Promise<(T | null)[]>;
   mset(entries: { key: string; value: unknown; ttlSeconds?: number }[]): Promise<void>;
   clear(): Promise<number>; // 清空当前隔离域
}
```

值会以 JSON 存储。`incr` 把当前值当数字累加（非数字视作 0）。

### 用户隔离

由函数的 `kvUserIsolated` 开关决定：

- **开启（默认）**：每个用户一份独立命名空间。用户 A 写的 `hits`，用户 B 读不到。
  适合"每个用户的积分/进度/草稿"。
- **关闭**：该函数所有调用者共享一份数据。适合"全站计数器 / 公共缓存"。
  ⚠️ 关闭后任何能调用该函数的成员都能改这些数据，请谨慎使用。

无用户的系统/判题调用会落到 `sys:<调用方>` 作用域，不会混进任何真实用户的空间。

### key 与配额

| 项 | 限制 |
|---|---|
| key 字符集 | 仅 `A-Za-z0-9_-.:/`，不能为空、不超过 256 字节 |
| key 前缀 | 由服务端自动拼接，你写的是**逻辑 key**，看不到也改不了隔离域 |
| 单值大小 | 64 KiB |
| TTL | 默认 1 天，最大 7 天 |
| 单隔离域 | 最多 1000 个 key / 4 MiB |
| 单次调用 | 最多 200 次 KV 操作 |
| 限流 | 约 100 ops/s（按函数 + 用户） |

`keys(pattern)` 的 pattern 不能以 `/` 或 `:` 开头，且只在自己隔离域内匹配。

## 4. 发布与调试

1. 后台"云函数"页面创建函数（名字、描述、是否用户隔离、超时）。
2. 在编辑器里写源码 → 保存为一个版本 → 激活。
3. **试运行**：发布前可用"试运行"端点（`POST /v1/functions/:name/test`）用当前源码跑一次；
   它的 KV 写在独立的 `:test` 命名空间，不会污染真实数据。

回滚：把任意历史版本重新激活即可（版本不可变，随时切回）。

## 5. 限制与安全模型（务必了解）

- **超时**：默认 5 秒，函数可配，硬上限 30 秒。死循环会被强制终止，不会拖垮服务。
- **内存**：默认 128 MB，超限返回 `OOM`。
- **无网络、无文件、无进程**：沙箱里只有纯计算全局变量与 `ctx`。
- **发布者可信**：当前沙箱（Worker + `node:vm` + 资源限制）针对的是"管理员写的代码防误伤"，
  **不是**"防恶意代码逃逸"。因此平台**不允许成员自助发布**。
  若未来要开放成员发布，必须先把沙箱升级为 `isolated-vm` 或一次性容器。

## 6. 错误码速查

| code | 含义 |
|---|---|
| `INVALID_INPUT` | input/参数/key 不合法 |
| `COMPILE_ERROR` | 源码编译失败（含引用了外部模块） |
| `TIMEOUT` | 执行超时 |
| `OOM` | 内存超限 |
| `RUNTIME_ERROR` | 函数抛错 |
| `KV_QUOTA_EXCEEDED` | KV 配额或限流 |
| `FUNCTION_DISABLED` / `FUNCTION_NOT_PUBLISHED` | 函数被停用 / 没有生效版本 |
| `FORBIDDEN` | 调用方无权调用（scope 或白名单） |
