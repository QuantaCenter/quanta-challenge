# 云函数

`qpc check` 可以在本地运行前端题的云函数。发布云函数时需要用管理员账号登录目标平台。题目通过函数名绑定该函数当前的生效版本。

## 编写源码和导出类型

```bash
qpc agent dts --type cloud-function > cloud-function.d.ts
```

把 `cloud-function.d.ts` 纳入本地 TypeScript 项目，即可直接使用全局类型 `CloudFunctionContext<TInput>`。它和网页云函数编辑器使用同一份声明，包含 `input`、`user`、`kv`、`log`、`fn`、`requireUser()` 和 `requireInput()`。其中 `requireInput()` 会检查输入是对象且包含指定字段，字段值仍需在函数中校验。

```ts
// cart-total.ts
type CartInput = { amounts: unknown };

export default function (ctx: CloudFunctionContext<CartInput>) {
   const { amounts } = ctx.requireInput<CartInput>(['amounts']);
   if (!Array.isArray(amounts) || !amounts.every(
      (amount): amount is number => typeof amount === 'number' && Number.isFinite(amount),
   )) {
      throw new Error('amounts 必须是数值数组');
   }
   return { total: amounts.reduce((sum, amount) => sum + amount, 0) };
}
```

使用单个自包含的 TypeScript 或 JavaScript 文件，以 `export default` 导出处理函数，返回可序列化为 JSON 的值。发布命令只上传指定的源码文件，源码上限为 200,000 字符。函数名以小写字母开头，可包含小写字母、数字和连字符，长度为 1–63 字符。

## 和题目一起本地检查

将 `cart-total.ts` 放在题目根目录，与 `answer/`、`template/` 并列。在前端题的配置里填写这两个字段。

```ts
cloudFunctionName: 'cart-total',
cloudFunctionSource: './cart-total.ts',
```

参考解可使用相对路径或平台的完整地址。下面的代码可同时用于本地检查、线上审核和正式判题。

```js
const response = await fetch('/api/cloud-function/invoke/cart-total', {
   method: 'POST',
   headers: { 'content-type': 'application/json' },
   body: JSON.stringify({ input: { amounts: [2, 4] } }),
});
const { data } = await response.json(); // { total: 6 }
```

运行 `qpc check --strict`。`qpc` 在打开页面前接管配置中的函数调用，编译并运行本地源码。页面加载时发出的请求也会进入本地运行时。本地调用可以省略令牌，云函数会收到模拟登录用户。参考解与模板各自从空的内存 KV 开始，同一次运行里的多个调用共享 KV。`judge.js` 按正常流程检查页面结果即可。

`qpc check --no-run` 只检查配置与源码路径等静态信息。`cloudFunctionSource` 供本地检查使用。用 `qpc cloud-function publish` 发布并激活函数，再用 `qpc upload` 保存题目绑定。

## 发布与激活

```bash
qpc cloud-function publish cart-total ./cart-total.ts --description '计算购物车合计'
```

首次发布会创建函数和版本。后续发布保存新版本，源码与最新版本完全相同时会复用该版本。平台在发布时编译源码，可在网页云函数编辑器里试运行以验证实际输出。

| 参数 | 行为 |
| --- | --- |
| `--description <text>` | 首次创建时写入描述，最多 2,000 字符。 |
| `--no-activate` | 保存版本并保留当前生效版本。首次发布使用此参数时，需在网页激活一个版本后才能绑定题目。 |
| `--json` | 返回函数名 `name`、版本 `version`、版本 ID `versionId`、是否新建函数 `created`、是否复用版本 `reused`、本次是否激活版本 `activated` 和编译产物字节数 `compiledBytes`。 |

函数的启用状态由网页管理。题目要求该函数已启用，且已有生效版本。

## 绑定题目

| 操作 | 用法 |
| --- | --- |
| 随上传保存绑定 | 在 `problem.config.ts` 写入 `cloudFunctionName: 'cart-total'`，先激活函数，再运行 `qpc upload`。更新题目时省略该字段会沿用当前绑定。 |
| 发布审核通过的题目 | `qpc publish <pid>`。可用 `--cloud-function cart-total` 核对该版本的绑定。 |
| 清除绑定 | 将 `cloudFunctionName` 设为 `null`，删掉 `cloudFunctionSource`，然后重新上传参考解审核。发布时可用 `--clear-cloud-function` 核对该版本已解绑。 |

线上审核和正式判题会把 `POST /api/cloud-function/invoke/<name>` 转给题目绑定的已发布函数。判题调度器在服务端认证，浏览器使用上面的 JSON 请求即可。每个判题任务使用模拟登录用户和独立临时 KV，同一轮多次调用共享 KV。

在做题页交互预览时，可从侧栏复制完整地址和短期调用令牌。令牌保存在当前会话中，避免提交进模板、参考答案或源码。

## 排查问题

| 现象 | 检查项 |
| --- | --- |
| 本地检查报 `CFG003` | 确认 `cloudFunctionSource` 指向普通源码文件，路径以题目根目录为基准。 |
| 云函数不可用，绑定返回 `PRECONDITION_FAILED` | 在同一平台检查函数名、启用状态和生效版本。 |
| 本地检查报编译错误，或发布返回 `BAD_REQUEST` | 参考报错中的编译信息，检查语法、源码长度和外部依赖。 |
| 当前平台版本尚未支持发布时指定云函数 | 检查 `--api` 是否指向已更新的目标平台。 |

函数的部署状态由平台在上传或发布时校验。云函数的真实身份和线上 KV 行为可在测试环境的做题页验证。
