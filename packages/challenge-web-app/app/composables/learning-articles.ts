import type { ArticleCoverPreset } from './use-learning';

/**
 * 初始文章（学习内容的正文真源）。
 *
 * 为什么单独一个文件：文章正文是 Markdown 长文本，和课程 / 专题的短配置放在一起
 * 会让 `learning-content.ts` 变得很长；拆开后「改内容」只需要看这一个文件。
 *
 * 约定：
 *   · `slug` 是稳定标识，专题靠它引用文章，**不要随手改**；
 *   · 正文里引用题目写 `<Problem baseId={…} />`，题号来自 `PROBLEM_REGISTRY`；
 *   · 每篇结构保持一致：小标题 → 说明 / 代码 / 列表 → 需要时收一句强调整句。
 */

export interface SeedArticle {
   slug: string;
   title: string;
   summary: string;
   coverPreset: ArticleCoverPreset;
   /** 正文源码：Markdown，插入题目处写 <Problem baseId={…} /> */
   body: string;
}

export const SEED_ARTICLES: SeedArticle[] = [
   /* ================= HTML ================= */

   {
      slug: 'document-tree',
      title: '文档树：浏览器眼里没有「文本」',
      summary: 'HTML 被解析成一棵 DOM 树，之后的一切都发生在这棵树上',
      coverPreset: 'ember',
      body: `浏览器拿到 HTML 文本之后，第一件事不是「画出来」，而是把它解析成一棵 DOM 树。你写下的每一个标签，最终都会变成树上的一个节点。

## 树是怎么长出来的

- \`<html>\` 是根节点，\`<head>\` 与 \`<body>\` 是它的两个孩子
- 标签的嵌套关系直接变成父子关系
- 文本也是一个节点，和元素节点平级

\`\`\`html
<main>
   <h1>标题</h1>
   <p>正文</p>
</main>
\`\`\`

上面这段会变成：\`main\` 节点下挂着 \`h1\` 与 \`p\` 两个子节点，每个元素里的文字各自是一个文本节点。

## 为什么先有树，再谈样式

CSS 选择器要找的是「树上的节点」，不是「文本里的字符串」。理解这一点之后，\`:nth-child\`、\`>\`、\`~\` 这些选择器就不再是符号记忆，而是树上的一次行走：

- \`>\` 是「直接子节点」
- \`~\` 是「后面的兄弟节点」
- \`:nth-child(2)\` 是「第二个子节点」，与它是什么标签无关

> 调试时在 Console 里输入 \`$0\`，指的就是 Elements 面板里当前选中的那个节点——可以把它当成树上的一个坐标。`,
   },

   {
      slug: 'parsing-is-forgiving',
      title: '解析容错：为什么少了闭合标签也不报错',
      summary: 'HTML 解析器会按规范猜测意图，再把缺失的部分补完',
      coverPreset: 'slate',
      body: `和 XML 不同，HTML 的解析器不会因为一个没闭合的标签就罢工。它按规范里写死的规则猜测你的意图，然后把树补完——这套规则叫「错误恢复」。

## 几个真实的容错行为

- \`<p>\` 里嵌 \`<div>\` 会被自动拆开，因为 \`<p>\` 不允许包含块级元素
- 表格外的 \`<tr>\` 会被默默丢弃
- 缺失的 \`<html>\` / \`<head>\` / \`<body>\` 会被补齐

\`\`\`html
<p>第一段<div>块级</div>
\`\`\`

上面这段在浏览器里会变成两个兄弟节点：\`<p>第一段</p>\` 和 \`<div>块级</div>\`。

## 容错不等于可以随便写

同一段文本交给不同的解析器，结果未必一样。邮件客户端、爬虫、Markdown 渲染器都可能有各自的补全策略。

- 标签该闭合就闭合，不要依赖浏览器替你猜
- 结构标签按层级嵌套，别让解析器来拆
- 上线前用校验器过一遍，成本最低

> 容错是浏览器的善意，不是你少写闭合标签的理由。`,
   },

   {
      slug: 'semantic-tags',
      title: '语义化标签：视觉相同，写法只有一种对',
      summary: '用对标签，键盘、读屏和搜索引擎都会受益',
      coverPreset: 'ember',
      body: `同一个视觉效果可以用很多种标签实现，但只有一种是对的。语义化不是洁癖，它直接决定了页面能不能被键盘和读屏软件正常使用。

## 一个链接 vs 一个按钮

\`\`\`html
<button onclick="location.href='/a'">去 A 页</button>
<a href="/a">去 A 页</a>
\`\`\`

两行看起来几乎一样，但只有第二个能：

- 被 Tab 键聚焦、回车打开
- 被右键「在新标签页打开」
- 被读屏软件识别为链接

判断口径很简单：**导航用 \`<a>\`，改状态用 \`<button>\`。**

## 结构标签不是装饰

\`<header>\`、\`<nav>\`、\`<main>\`、\`<article>\`、\`<footer>\` 把页面的骨架写进了标签。读屏用户可以直接跳到 \`<main>\`，搜索引擎也能分清哪一段是正文。

\`\`\`html
<article>
   <header><h1>标题</h1></header>
   <p>正文</p>
   <footer>发布于 3 月 12 日</footer>
</article>
\`\`\`

## 动手一遍

<Problem baseId={6} />`,
   },

   {
      slug: 'forms-and-a11y',
      title: '表单可访问性：三个最常被忽略的细节',
      summary: 'label、错误提示、提交按钮，决定表单能不能被正常使用',
      coverPreset: 'slate',
      body: `表单是网页里最需要照顾键盘与读屏软件的地方。这一篇只看三个最容易被忽略的细节。

## 1. label 要和输入框对上

\`<label for>\` 的 \`for\` 必须等于输入框的 \`id\`，点击文字才能聚焦输入框。

\`\`\`html
<label for="email">邮箱</label>
<input id="email" type="email" />
\`\`\`

## 2. 错误提示要能被读出来

只画一个红框，读屏用户完全不知道发生了什么。用 \`aria-describedby\` 把提示关联到输入框：

\`\`\`html
<input id="email" type="email" aria-describedby="email-tip" />
<p id="email-tip">我们只用来找回密码</p>
\`\`\`

## 3. 提交用 button

用 \`<div onclick>\` 提交的表单，键盘和读屏都无法触发。老老实实写 \`<button type="submit">\`。

## 数据属性

\`data-*\` 是「写在 HTML 上、读在脚本里」的接口：

\`\`\`html
<tr data-name="keyboard">
   <td class="price" data-price="24.5">24.50</td>
</tr>
\`\`\`

脚本靠 \`dataset.price\` 拿到单价；主题切换把它用在 \`<html data-theme="dark">\` 上。

<Problem baseId={7} />`,
   },

   /* ================= CSS ================= */

   {
      slug: 'flex-layout',
      title: 'Flex 布局：先把一维排列讲清楚',
      summary: '主轴、交叉轴与剩余空间，三件事决定一行怎么排',
      coverPreset: 'aurora',
      body: `Flex 解决的是一维排列问题：一行（或一列）里的元素怎么分空间。

## 三个属性就够了

- \`display: flex\` 建立格式化上下文，子元素成为 flex item
- \`justify-content\` 管主轴，\`align-items\` 管交叉轴
- \`flex: 1\` 是 \`flex-grow: 1; flex-shrink: 1; flex-basis: 0%\` 的缩写

\`\`\`css
.row {
   display: flex;
   gap: 0.75rem;
   align-items: center;
}

.row > .grow {
   flex: 1;
   min-width: 0; /* 不加它，长文本不会缩，布局会被撑破 */
}
\`\`\`

## 最值得单独记的一个坑

\`min-width\` 的默认值是 \`auto\`，而 \`flex-shrink\` 默认是 1。两者叠在一起的结果是：内容比容器宽时，flex item 拒绝收缩。

> 规则：只要某个 flex item 里有会溢出的长文本，就给它加 \`min-width: 0\`。

## 动手一遍

<Problem baseId={6} />`,
   },

   {
      slug: 'grid-layout',
      title: 'Grid 布局：二维排版与自适应卡片墙',
      summary: '当排列方向不止一个，就该交给 grid',
      coverPreset: 'mint',
      body: `只要排列方向不止一个，就轮到 grid：它同时管行和列。

## 一行代码的卡片墙

\`\`\`css
.wall {
   display: grid;
   grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
   gap: 1rem;
}
\`\`\`

\`auto-fill\` + \`minmax\` 的意思：每列至少 16rem，能塞几列塞几列，多余宽度平均分掉。不需要任何媒体查询，窄屏自动变成一列。

## 一个判断口径

- 需要同时控制行与列：grid
- 只控制一个方向、元素数量不定：flex

> \`minmax(0, 1fr)\` 是给「内容会溢出」的网格列准备的：默认的 \`1fr\` 等价于 \`minmax(auto, 1fr)\`，同样会被内容撑破。`,
   },

   {
      slug: 'custom-properties',
      title: 'CSS 变量：运行时可读写的样式参数',
      summary: '它是主题化的地基，也是 JS 与 CSS 之间的接口',
      coverPreset: 'violet',
      body: `自定义属性（CSS 变量）和 Sass 变量最大的区别是：**它是运行时的，能被 JavaScript 读写，也能参与层叠。**

## 声明与使用

\`\`\`css
:root {
   --card: #ffffff;
}

html[data-theme='dark'] {
   --card: #161d26;
}

.card {
   background: var(--card);
}
\`\`\`

组件样式里一行主题判断都不写：换主题只是换了一组变量值。

## 通过覆盖变量做主题

\`\`\`css
html[data-theme='dark'] {
   --bg: #10151c;
   --card: #161d26;
   --text: #e5e5e5;
}
\`\`\`

只要颜色都收敛成变量，深色主题的整个实现可以只有十几行。反过来说，**硬编码的颜色不会被主题覆盖**，这是后期改造成本最高的一类问题。

## 动手一遍

<Problem baseId={7} />`,
   },

   {
      slug: 'dark-mode',
      title: '深色模式的三个坑',
      summary: '纯黑、图片过亮、刷新闪一下，都是上线后才暴露',
      coverPreset: 'aurora',
      body: `主题切换做出来只是第一步。这一篇记三个上线之后才会暴露的坑。

## 1. 不要用纯黑

\`#000\` 配白字在 OLED 屏上会有「拖影」，长时间看也累。用偏蓝的近黑更耐看：

\`\`\`css
:root {
   --bg: #10151c;
}
\`\`\`

## 2. 图片要降亮度

深色背景上的截图会显得刺眼，一层滤镜就够了：

\`\`\`css
[data-theme='dark'] img {
   filter: brightness(0.85);
}
\`\`\`

## 3. 刷新会闪一下

如果主题是在脚本里读的，而脚本放在 \`<body>\` 末尾，页面会先按浅色渲染再跳成深色。把读取逻辑放进 \`<head>\` 里的同步脚本：

\`\`\`html
<script>
   const saved = localStorage.getItem('theme');
   if (saved) document.documentElement.dataset.theme = saved;
</script>
\`\`\`

> 判断标准：刷新页面时不应看到任何颜色的跳变；有跳变，就说明主题应用得太晚了。`,
   },

   {
      slug: 'specificity',
      title: '优先级与层叠：样式为什么没生效',
      summary: '用三元组算权重，用 :where() 主动降低权重',
      coverPreset: 'mint',
      body: `「样式没生效」九成是优先级问题，而不是浏览器坏了。

## 权重怎么算

按 \`(id, class, 元素)\` 三元组比较：

- 内联样式高于任何选择器
- \`#id\`（1,0,0）> \`.class\` / \`[attr]\` / \`:hover\`（0,1,0）> \`div\`（0,0,1）
- \`*\` 与组合符（\`>\`、\`+\`、\`~\`）不增加权重

## 主动降低权重

\`:where()\` 的权重是 0，\`:is()\` 取参数里最高的那个：

\`\`\`css
/* 权重 (0,1,0)，别人很难覆盖 */
.card .title { color: red; }

/* 权重 (0,0,0)，第三方样式随手就能改 */
:where(.card) .title { color: red; }
\`\`\`

## 同一权重看顺序

权重相同时，后写的胜出——这也是「引入顺序」会实打实影响结果的原因。

> 写组件库时优先用 \`:where()\`：把「能不能被覆盖」的决定权还给使用方。`,
   },

   {
      slug: 'attribute-selectors',
      title: '属性选择器：把状态直接写进选择器',
      summary: '[data-theme] 这类写法为什么好用',
      coverPreset: 'slate',
      body: `属性选择器把「状态」直接写进选择器，非常适合配合 \`data-*\` 使用。

## 常用的三种

\`\`\`css
[data-theme='dark'] { /* 完全匹配 */ }
[data-theme] { /* 存在即可 */ }
[data-name^='keyboard'] { /* 前缀匹配 */ }
\`\`\`

## 为什么用属性而不是类名

- 属性值自带语义（\`data-theme="dark"\`），JS 读写就是 \`dataset.theme\`
- 布尔状态用「有没有这个属性」表达，不用在两个类名之间来回切
- 选择器短，也很好在 DevTools 里搜

\`\`\`js
document.documentElement.dataset.theme = 'dark';
// 对应选择器 [data-theme='dark']
\`\`\`

> 类名管「样式」，属性管「状态」，两者混用时优先把状态留在属性上。`,
   },

   /* ================= JavaScript ================= */

   {
      slug: 'node-operations',
      title: 'DOM 节点操作：建、填、插三件套',
      summary: '记住三个动作，绝大多数列表渲染都能写出来',
      coverPreset: 'mint',
      body: `DOM 操作只有三个动作：建节点、填内容、插进树里。记住它们，列表渲染就不难了。

## 三件套

- 建：\`document.createElement(tag)\`
- 填：\`element.textContent = '…'\`（只有要插标签时才用 \`innerHTML\`）
- 插：\`parent.append(child)\`

\`\`\`js
const render = (items) => {
   const list = document.querySelector('#list');
   list.replaceChildren(
      ...items.map((item) => {
         const li = document.createElement('li');
         li.textContent = item.name;
         return li;
      }),
   );
};
\`\`\`

\`replaceChildren\` 一次换掉全部子节点，比「先 \`innerHTML = ''\` 再循环 append」少一次重排。

## 文本用 textContent

\`textContent\` 不会解析 HTML，天然免疫注入。只有确实要插入标签结构时，才考虑 \`innerHTML\`，并且要保证内容可信。

## 动手一遍

<Problem baseId={6} />`,
   },

   {
      slug: 'event-delegation',
      title: '事件委托：为什么给容器挂一个监听就够',
      summary: '冒泡加 closest，动态列表不再逐个绑定',
      coverPreset: 'violet',
      body: `列表有 100 行时，挂 100 个监听器既费内存又难维护。事件委托只挂一个。

## 原理

事件从目标元素向上冒泡，所以在容器上监听就能收到所有子元素的事件：

\`\`\`js
list.addEventListener('click', (event) => {
   const row = event.target.closest('[data-name]');
   if (!row) return; // 点在空白处
   remove(row.dataset.name);
});
\`\`\`

## 两个注意点

- \`event.target\` 可能只是子元素，所以要用 \`closest()\` 找到真正要处理的那一层
- 动态插入的新行**不需要重新绑定**——这是委托最大的收益

## input 而不是 change

表单控件的实时值用 \`input\` 事件，而不是 \`change\`：\`change\` 要等失焦才触发，实时计算合计会慢半拍。`,
   },

   {
      slug: 'local-storage',
      title: 'localStorage：边界比你想象的多',
      summary: '只能存字符串、同步、隐私模式下可能直接抛异常',
      coverPreset: 'slate',
      body: `localStorage 只能存字符串，而且是同步 API。这两条决定了它的用法和边界。

## 基本往返

\`\`\`js
localStorage.setItem('theme', 'dark');

const theme = localStorage.getItem('theme'); // 拿不到就是 null
\`\`\`

存对象要先 \`JSON.stringify\`，读回来要 \`JSON.parse\`，并且**要处理解析失败**：

\`\`\`js
const readState = () => {
   try {
      return JSON.parse(localStorage.getItem('app-state') ?? 'null');
   } catch {
      return null; // 坏数据当没有，不要让整页挂掉
   }
};
\`\`\`

## 边界

- 同源共享、永久保存；会话级数据用 \`sessionStorage\`
- 同步 API，别在主线程里存大对象，大文件交给 IndexedDB
- 隐私模式下可能直接抛异常，写入要 \`try/catch\`

## 动手一遍

<Problem baseId={7} />`,
   },

   {
      slug: 'async-basics',
      title: 'Promise 与 async/await：把回调压成直线',
      summary: '异步难读的不是异步，而是被打散的控制流',
      coverPreset: 'violet',
      body: `异步代码难读的根源不是「异步」，而是控制流被打散了。\`async/await\` 把它还原成一条直线。

## 同一个流程的两种写法

\`\`\`js
// 回调嵌套
fetch('/api/user').then((res) =>
   res.json().then((user) => {
      fetch('/api/orders/' + user.id).then((r) =>
         r.json().then((orders) => render(orders)),
      );
   }),
);

// async/await
const load = async () => {
   const user = await fetch('/api/user').then((r) => r.json());
   const orders = await fetch('/api/orders/' + user.id).then((r) =>
      r.json(),
   );
   render(orders);
};
\`\`\`

## 三个必须知道的点

- \`await\` 只能出现在 \`async\` 函数里
- 忘记 \`await\` 拿到的是 Promise 本身，打印出来是 \`Promise { <pending> }\`
- \`await\` 的报错要用 \`try/catch\` 接住，否则会变成 unhandled rejection

> \`async\` 函数永远返回 Promise：哪怕你 \`return 1\`，调用方拿到的也是 \`Promise<number>\`。`,
   },

   {
      slug: 'promise-concurrency',
      title: '并发控制：Promise.all 与分批执行',
      summary: '一起等用 all，限流用分批加 await',
      coverPreset: 'aurora',
      body: `并发不是「一次发出去越多越好」。这一篇给出两个常用形状。

## 一起等：Promise.all

\`\`\`js
const [user, orders] = await Promise.all([
   fetch('/api/user').then((r) => r.json()),
   fetch('/api/orders').then((r) => r.json()),
]);
\`\`\`

任意一个 reject，整体就 reject——这就是「全都成功才算成功」。允许部分失败时用 \`Promise.allSettled\`。

## 限制并发：分批 + await

\`\`\`js
const inBatches = async (tasks, size = 3) => {
   const results = [];
   for (let i = 0; i < tasks.length; i += size) {
      const batch = await Promise.all(
         tasks.slice(i, i + size).map((task) => task()),
      );
      results.push(...batch);
   }
   return results;
};
\`\`\`

## 该选哪个

- 请求互不依赖、都要拿到：\`Promise.all\`
- 数量大、要保护后端：分批控制并发数

> 面试常被追问「不用 \`Promise.all\` 怎么限流」——答案是一个计数器加队列；但工程上先写出分批版本通常就够了。`,
   },

   /* ================= 浏览器调试 ================= */

   {
      slug: 'devtools-panels',
      title: '调试面板：哪类问题去哪个面板',
      summary: 'Elements / Console / Network 各管一段',
      coverPreset: 'mint',
      body: `调试面板不需要背，只需要知道「哪类问题去哪个面板」。

## 三块面板

- **Elements**：看真实的 DOM 与最终生效的 CSS（被划掉的样式 = 被覆盖或非法）
- **Console**：跑一次性表达式，看报错与调用栈
- **Network**：看请求、状态码、耗时与响应体

## 一个常用技巧

在 Elements 里选中节点后，Console 里输入 \`$0\` 就是它：

\`\`\`js
$0.dataset; // 这个元素上的所有 data-*
getComputedStyle($0).backgroundColor; // 最终生效的颜色
\`\`\`

## computed 才是最终结果

\`getComputedStyle\` 返回的永远是解析后的值：\`var(--card)\` 会变成具体的 \`rgb(...)\`，百分比会被换算成像素。

> 样式不生效时，先看 Styles 面板里那条规则是否被划掉——划掉说明它被更高优先级的规则覆盖了。`,
   },

   {
      slug: 'breakpoints',
      title: '断点与调用栈：不写 log 也能看清现场',
      summary: '条件断点、debugger、从下往上读栈',
      coverPreset: 'slate',
      body: `断点比 \`console.log\` 强的地方在于：它能看到**那一刻的完整现场**，而不是你事先猜要打印的东西。

## 三种断点

- 行断点：在 Sources 里点行号
- 条件断点：右键行号写条件，比如 \`i === 3\`，循环里一次不停的调试靠它
- 代码里的 \`debugger\`：临时有效，但容易在提交前被忘掉

## 调用栈从下往上读

最底下是浏览器或框架入口，最上面是当前停下的函数，中间几层就是「谁调用了谁」。

\`\`\`text
renderList (list.js:12)   ← 当前
load (list.js:30)
onClick (list.js:41)      ← 入口
\`\`\`

异步的调用栈会在 \`await\` 处断开，看不到上一段，这是正常现象；要看跨异步的链路，需要打开 async 调用栈。`,
   },

   /* ================= Git 与协作 ================= */

   {
      slug: 'commit-message',
      title: '提交信息怎么写才经得起回看',
      summary: '半年后翻 git log 的人，就是你的读者',
      coverPreset: 'slate',
      body: `提交信息不是写给今天的自己，而是写给半年后在 \`git log\` 里找原因的人。

## 一个够用的格式

\`\`\`text
<type>(<scope>): <做了什么>

<为什么这么做，而不是怎么做的>
\`\`\`

常见 type：\`feat\` / \`fix\` / \`refactor\` / \`docs\` / \`test\` / \`chore\`。

## 两条硬规则

- 标题不超过 50 字符，用祈使句（\`add\` 而不是 \`added\`）
- 一个提交只做一件事，\`git log\` 才能用来二分定位

## 反例

\`\`\`text
update
fix bug
修改
\`\`\`

这三条在回看时等于没写：既不知道改了什么，也不知道为什么改。

> 好提交信息的标准很简单：只读这一行，就能判断要不要展开看 diff。`,
   },

   {
      slug: 'branch-model',
      title: '分支模型：让主干随时可发布',
      summary: '功能开分支，合回主干前先 rebase',
      coverPreset: 'ember',
      body: `分支模型的目标只有一个：**主干上的任意一个提交都是可发布的**。

## 两条最小规则

- 功能开分支：\`feat/theme-switch\`，短命名、带类型前缀
- 合回主干前先 rebase，把「边写边改」的噪声压成几个能讲清楚的提交

\`\`\`bash
git switch -c feat/theme-switch
# ... 提交若干次 ...
git fetch origin
git rebase origin/main
git push -u origin feat/theme-switch
\`\`\`

## 冲突与信任

- 冲突是「同一处被两边改过」的信号，先看两边意图再合并，别直接选一边
- 共享分支上不要 force push，只在自己独占的分支上 rebase

> 主干越干净，「回滚到某个能跑的版本」这件事就越可靠。`,
   },

   {
      slug: 'merge-conflicts',
      title: '一次合并冲突的处理流程',
      summary: '看懂冲突标记，再决定保留什么',
      coverPreset: 'violet',
      body: `冲突并不可怕，它只是 Git 在说：这里我拿不准，你来定。

## 冲突标记怎么读

\`\`\`text
<<<<<<< HEAD
const timeout = 3000;
=======
const timeout = 5000;
>>>>>>> feat/slow-network
\`\`\`

- \`<<<<<<<\` 到 \`=======\` 之间是当前分支（HEAD）的内容
- \`=======\` 到 \`>>>>>>>\` 之间是合进来的那一方

## 处理步骤

1. 打开文件，保留正确的内容，**删掉三行标记**
2. 全局搜一遍 \`<<<<<<<\`，确认没有遗漏
3. \`git add\` 冲突文件，再 \`git rebase --continue\`（或 \`git merge --continue\`）

## 慌的时候看状态

\`\`\`bash
git status
\`\`\`

它会列出还剩哪些文件没处理完，跟着走就不会丢东西。`,
   },
];
