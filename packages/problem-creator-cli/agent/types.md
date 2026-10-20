# Judge 脚本的 Type Schema

以下签名以**线上运行时**为准（judge-machine / backend-judge-machine 的 `lib/system.ts`）。
完整声明文件：`qpc agent dts --type frontend > judge.d.ts`（或 `--type backend`），放进题目目录后编辑器可补全。

## 公共部分

```ts
declare function defineTestHandler(
   handler: (ctx: FrontendCtx | BackendCtx) => Promise<void>,
): unknown; // 只能写成 export default defineTestHandler(...)

interface CheckPointCtx {
   score: {
      increment(n: number): void; // 累加本检查点得分
      set(n: number): void;
      get(): number;
   };
}

interface SystemCommon {
   /** 定义检查点：handler 的返回值即得分；不 return 时用 score 累计值（初始 0） */
   defineCheckPoint(
      name: string,          // 展示给学生，应唯一
      totalScore: number,    // 必须是数字字面量（qpc check 要静态累加）
      handler: (ctx: CheckPointCtx) => Promise<number | void> | number | void,
      options?: { passScore?: number; passScoreRate?: number }, // 默认满分才算 pass
   ): void;
   /** 同步断言：假值时抛出 Error(`“${desc}”不符合要求`)。不要传 async 函数（Promise 恒为真） */
   expect(expression: unknown | (() => unknown), desc: string): void;
   /** 按 0~1 的比率折算分数：clamp(rating()) * totalScore */
   score(totalScore: number, rating: () => number): Promise<number>;
}
```

## 前端：`({ page, $ })`

```ts
interface FrontendCtx {
   page: ExposePage;
   $: SystemCommon & {
      /** 审核时保存参考截图并返回 1；判题时与参考图比较，返回相似度 0~1。buffer ≤ 5MB */
      saveOrCompare(input: { type: 'image'; buffer: Buffer; name?: `${string}.png` }): Promise<number>;
   };
}

/** Playwright Page（1.54）去掉 goto，并只保留 Page 自身及其原型上的成员 */
type ExposePage = Omit<import('playwright').Page, 'goto' | 'on' | 'off' | 'once' | 'addListener' | 'removeListener'> & {
   /** 等待调用之后发出的请求全部结束并静默 500ms；超时返回 false（不抛错）。timeout 默认 3000，上限 5000 */
   waitForNetworkIdle(options?: { timeout?: number }): Promise<boolean>;
};
```

常用成员：`$` / `$$`（找不到返回 `null` / `[]`）、`$eval` / `$$eval`、`evaluate`、`locator`、`click` / `fill` / `type` / `hover`（都接受 `{ timeout }`）、
`waitForSelector`、`waitForTimeout`、`waitForFunction`、`reload`、`setViewportSize`、`screenshot`、`keyboard`、`mouse`、`textContent`、`getAttribute`、`title()`（异步）、`url()`。

平台编辑器里的旧版 `.d.ts` 与运行时有出入，以本节为准：

- `page.getComputedStyle(...)`、`mouse.rightClick`、`mouse.dragAndDrop` **不存在**：样式用 `page.$eval(sel, el => getComputedStyle(el).color)`。
- `page.title()` 返回 Promise，要 `await`。
- `$.expect` 是同步函数；旧声明里写的 `Promise<void>` 不对，传 async 回调会恒通过。
- `page.waitForNetworkIdle` 旧声明里没有，但运行时可用。

## 后端：`({ http, $ })`

```ts
interface BackendCtx {
   http: HttpClient;
   $: SystemCommon & {
      /** 把文本/二进制存为判题附件，返回 1 */
      save(content: string | Buffer, name?: string): number;
   };
}

interface HttpClient {
   get(path: string, options?: HttpRequestOptions): Promise<HttpResult>;
   post(path: string, body?: unknown, options?: HttpRequestOptions): Promise<HttpResult>;
   put(path: string, body?: unknown, options?: HttpRequestOptions): Promise<HttpResult>;
   patch(path: string, body?: unknown, options?: HttpRequestOptions): Promise<HttpResult>;
   delete(path: string, body?: unknown, options?: HttpRequestOptions): Promise<HttpResult>;
}
interface HttpRequestOptions { headers?: Record<string, string>; timeoutMs?: number } // 默认 10000
interface HttpResult {
   status: number;
   headers: Record<string, string>; // 键为小写
   text: string;
   buffer: Buffer;
   json: any; // content-type 含 json 且解析成功时才有，否则 undefined
}
```

## 沙箱全局

可用：`defineTestHandler`、`page` / `http`、`$`、`Buffer`、`console`（线上不可见）以及 JS 内置对象（`JSON`、`Math`、`Promise`、`Array`……）。
不可用：`setTimeout`、`setInterval`、`fetch`、`URL`、`require`、`process`、`import`。
