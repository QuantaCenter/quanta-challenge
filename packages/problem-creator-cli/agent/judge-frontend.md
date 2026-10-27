# 如何编写前端 Judge 脚本（type: frontend）

## 骨架

```js
export default defineTestHandler(async ({ page, $ }) => {
   const text = async (selector) => {
      const el = await page.$(selector);
      if (!el) throw new Error('找不到元素 ' + selector);
      return (await el.textContent()).trim();
   };

   $.defineCheckPoint('初始计数为 0', 5, async () => {
      const actual = await text('#count');
      $.expect(actual === '0', '期望 #count 为 "0"，实际为 "' + actual + '"');
      return 5; // 必须 return 本检查点得分
   });
});
```

- 必须是 `export default defineTestHandler(...)`：判题机把第一处真正的 `export default ` 替换成 `const run = ` 再执行。不要有其它 `export`。
- `defineTestHandler`、`page`、`$` 是注入的全局，不要 import 任何东西。

## 运行时事实（线上判题机）

| 事实 | 后果 / 做法 |
| --- | --- |
| 静态服务器（live-server@1.2.2）以 `answer/`（审核）或学生工程为站点根；页面已经以 `domcontentloaded` 打开好，再执行脚本 | 不需要也不能导航：**没有 `page.goto`**，要回到初始状态用 `page.reload()` |
| 视口 1280×720；默认操作 / 导航超时 10 秒 | 元素不存在时 `page.click` 等会卡 10 秒，先 `page.$` 判空 |
| **整个脚本总预算 20 秒**，超时则**所有检查点作废**（记 0 分） | `waitForTimeout` 之和要远小于 20 秒；`qpc check` 会报告耗时 |
| 先执行 handler 顶层代码（只做定义），再**按定义顺序串行**执行各检查点，**共享同一个 page** | 前一个检查点改了页面状态会影响后面的；需要独立时在开头 `page.reload()`（或先清 localStorage 再 reload） |
| 检查点 handler 的返回值就是得分；不 return 记 0 分 | 每个检查点末尾 `return 分值;` |
| `$.expect(cond, msg)` 是**同步**的：`cond` 为假时抛错 `“msg”不符合要求`，本检查点记 0 分（已 increment 的分保留），其它检查点照常 | 不要 `await $.expect(...)` 也无妨；但**不要传 async 函数**（返回 Promise 永远为真，断言永远通过） |
| 检查点里抛出的任何异常只影响本检查点；**顶层代码抛异常**则整个脚本失败 | 顶层只放 `defineCheckPoint` 和工具函数 |
| 沙箱（vm2）里**没有** `setTimeout` / `setInterval` / `fetch` / `URL` / `require` / `process` | 等待用 `page.waitForTimeout(ms)`；网络用页面里的代码 |
| `page` 是受限代理：只有 Page 自身与其原型上的方法，**`page.on` / `page.off` 等继承方法不可用** | 等网络请求结束用平台补的 `page.waitForNetworkIdle({ timeout })` |
| `page.evaluate(fn)` / `page.$eval(sel, fn)` 里的 `fn` 在**浏览器**执行，可用 DOM、`MouseEvent`、`getComputedStyle` | 读计算样式、派发事件、判可见性都放在 evaluate 里 |
| 断言消息原样展示给学生 | 写成"操作 + 期望 + 实际" |

## 编写规范（实践中确实管用）

1. **判结果，不判实现**：读计算样式、测元素位置大小、看可见的 DOM 文本；不要用正则匹配学生源码。同一需求的多种合理写法（Flex/Grid、`display:none`/移除 DOM、`:hover` 里写样式）都应满分。
2. **断言消息**统一"操作 + 期望 + 实际"：`'点击添加后，列表期望为 ["买牛奶"]，实际为 ' + JSON.stringify(items)`。
3. **交互状态相关的样式**（`cursor`、`:hover`、`:focus`）要在对应状态下读取：先 `await page.hover(sel)` 再读 `getComputedStyle(el).cursor`。
4. **可见性**用 `el.getClientRects().length > 0`（在 evaluate 里），同时兼容移除 DOM 和 `display:none`。
5. **点击**：目标本应可用时 `page.click(sel, { timeout: 3000 })`；可能是 disabled 时在 evaluate 里派发 `new MouseEvent('click', { bubbles: true })`，否则 Playwright 会重试到超时。
6. **等待**：优先 `page.waitForSelector(sel, { timeout: 3000 })`；点击后才发请求的场景：

   ```js
   const idle = page.waitForNetworkIdle({ timeout: 3000 }); // 先挂等待（上限 5000）
   await page.click('#load', { timeout: 3000 });            // 再触发
   $.expect(await idle, '点击后 3s 内网络请求仍未结束');
   ```

7. **金额 / 浮点**：比较 `toFixed(2)` 后的字符串，并在题面要求保留两位小数。
8. **检查点粒度**：一个检查点验证一个可观察行为，分值与题面里写的一致；总分 = 各检查点之和（`totalScore` 不写则自动取和）。
9. **期望值不要心算**：让 `qpc check` 用参考解跑一遍。

## 常用片段

```js
// 读计算样式（在浏览器里执行）
const style = (sel, prop) =>
   page.$eval(sel, (el, p) => getComputedStyle(el)[p], prop);

// 可见性（兼容移除 DOM 与 display:none）
const visible = (sel) =>
   page.evaluate((s) => {
      const el = document.querySelector(s);
      return !!el && el.getClientRects().length > 0;
   }, sel);

// 即使 disabled 也点一下（验证"禁用时点击无效"）
const forceClick = async (sel) => {
   await page.$eval(sel, (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
   await page.waitForTimeout(150);
};

// 重置到初始状态
const reset = async () => {
   await page.evaluate(() => localStorage.clear());
   await page.reload({ waitUntil: 'domcontentloaded' });
};

// 部分得分
$.defineCheckPoint('三个按钮颜色正确', 9, async ({ score }) => {
   for (const sel of ['#a', '#b', '#c']) {
      if ((await style(sel, 'backgroundColor')) === 'rgb(37, 99, 235)') score.increment(3);
   }
   return score.get(); // 只拿部分分时检查点记为 fail（passScore 默认等于满分）
});
```

## 视觉对比（可选）

`await $.saveOrCompare({ type: 'image', buffer: await page.screenshot(), name: 'home.png' })`：
审核时保存参考截图并返回 1；学生判题时与参考图比较，返回相似度 0~1。配合 `$.score(满分, () => 相似度)` 给分。图片 ≤ 5MB，`name` 必须以 `.png` 结尾。截图受字体、动画影响，阈值要留余量。
