import type {
   ArticleCoverPreset,
   Difficulty,
   LearningProblemRef,
} from './use-learning';

/**
 * 学习内容的**真源**：课程 / 专题 / 文章的初始内容。
 *
 * 为什么文章正文写成 Markdown 字符串，而不是前几版的 `ContentBlock[]`：
 * 文章的「引用题目」只认正文里的 `<Problem baseId={…} />`（设计文档 §13.3），
 * 而文章编辑页的编辑表面就是 Markdown 源码。把真源写成同样的字符串形状，
 * 初始化内容与「在编辑页里手写一篇」走的才是同一条路，
 * 不会出现「内置文章能显示、编辑页打开却是空的」这种两套表示的问题。
 *
 * 题目只写 baseId（库里的题号）；pid、标题、难度、分值都在 PROBLEM_REGISTRY 里，
 * 由 store 在解析正文时补全——这也是编辑页插入题目的口径。
 */

/* ---------- 题库：两道已发布的题（本仓库 problems/ 下的目录） ---------- */

export interface ProblemMeta extends Omit<LearningProblemRef, 'baseId'> {
   baseId: number;
}

export const PROBLEM_REGISTRY: ProblemMeta[] = [
   {
      baseId: 6,
      // pid = 这道题当前发布的版本（改了配置重新上传会 +1，题号不变）
      pid: 8,
      title: '购物车合计',
      difficulty: 'easy' satisfies Difficulty,
      totalScore: 40,
   },
   {
      baseId: 7,
      pid: 9,
      title: '主题切换',
      difficulty: 'medium' satisfies Difficulty,
      totalScore: 40,
   },
];

export const seedProblems = (): LearningProblemRef[] =>
   PROBLEM_REGISTRY.map((problem) => ({ ...problem }));

/* ---------- 文章 ---------- */

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
      title: '文档树',
      summary: '浏览器拿到 HTML 之后，第一件事是把它变成一棵树',
      coverPreset: 'ember',
      body: `浏览器拿到 HTML 文本之后，第一件事不是「画出来」，而是把它解析成一棵 DOM 树。这篇只讲这棵树是怎么长出来的。

## 树是怎么长出来的

- \`<html>\` 是根，\`<head>\` 与 \`<body>\` 是它的两个孩子
- 标签的嵌套关系直接变成父子关系
- 文本也是一个节点，和元素节点平级

## 为什么先有树再谈样式

CSS 选择器要找的是「树上的节点」，不是「文本里的字符串」。理解这一点之后，
\`:nth-child\`、\`>\`、\`~\` 这些选择器就不再是符号记忆，而是树上的一次行走。
`,
   },

   {
      slug: 'parsing-is-forgiving',
      title: '解析容错',
      summary: '没闭合的标签为什么没有让页面崩掉',
      coverPreset: 'slate',
      body: `与 XML 不同，HTML 的解析器不会因为一个没闭合的标签就罢工。它按规范里写死的规则猜测你的意图，然后把树补完。

## 几个真实的容错行为

- \`<p>\` 里嵌 \`<div>\` 会被自动拆开——因为 \`<p>\` 不允许包含块级元素
- 表格外的 \`<tr>\` 会被默默丢弃
- 缺失的 \`<html>\` / \`<head>\` / \`<body>\` 会被自动补齐

\`\`\`html
<p>第一段<div>块级</div>
\`\`\`

上面这段在浏览器里会变成两个兄弟节点：\`<p>第一段</p>\` 和 \`<div>块级</div>\`。

> 容错是浏览器的善意，不是你少写闭合标签的理由：同样的文本交给不同的解析器（比如邮件客户端、爬虫），结果未必一样。`,
   },

   {
      slug: 'semantic-tags',
      title: '语义化标签',
      summary: '同一个视觉结果，只有一种写法是对的',
      coverPreset: 'ember',
      body: `同一个视觉效果可以用很多种标签实现，但只有一种是对的。这篇讨论怎么选。

## 一个链接 vs 一个按钮

\`\`\`html
<button onclick="location.href='/a'">去 A 页</button>
<a href="/a">去 A 页</a>
\`\`\`

两行的视觉结果几乎一样，但只有第二行能被键盘聚焦、能被右键「在新标签页打开」、
能被屏幕阅读器识别为链接。**导航用 \`<a>\`，改状态用 \`<button>\`。**

## 结构标签不是装饰

\`<header>\`、\`<nav>\`、\`<main>\`、\`<article>\`、\`<footer>\` 把页面的骨架写进了标签。
读屏软件的用户可以直接跳到 \`<main>\`，搜索引擎也能分清哪一段是正文。

## 动手一遍

<Problem baseId={6} />`,
   },

   {
      slug: 'forms-and-a11y',
      title: '表单与可访问性',
      summary: 'label、错误提示与按钮的三个细节',
      coverPreset: 'slate',
      body: `表单是网页里最需要照顾键盘与屏幕阅读器的地方。这一篇看三个最常被忽略的细节。

## 三个细节

- \`<label for>\` 要和输入框的 \`id\` 对上，点标签也能聚焦
- 错误提示要用 \`aria-describedby\` 关联，而不是只画一个红框
- 提交用 \`<button type="submit">\`，不要用 \`<div onclick>\`

\`\`\`html
<label for="email">邮箱</label>
<input id="email" type="email" aria-describedby="email-tip" />
<p id="email-tip">我们只用来找回密码</p>
\`\`\`

## 数据属性

和表单一起出现的还有 \`data-*\`：它是「写在 HTML 上、读在脚本里」的接口。

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
      title: 'flex 布局',
      summary: '一维排列：主轴、换行与剩余空间',
      coverPreset: 'aurora',
      body: `flex 解决的是一维排列问题：一行（或一列）里的元素怎么分空间。

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

> \`min-width: 0\` 是 flex 里最值得单独记一条的坑：\`flex-shrink\` 默认是 1，
> 但 **min-width 的默认值是 auto**，内容比容器宽时它拒绝收缩。

<Problem baseId={6} />`,
   },

   {
      slug: 'grid-layout',
      title: 'grid 布局',
      summary: '二维排版：把卡片墙交给 grid',
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

\`auto-fill\` + \`minmax\` 的意思：每列至少 16rem，能塞几列塞几列，
多余宽度平均分掉。不需要任何媒体查询，窄屏自动变成一列。

## 什么时候不用 grid

元素数量不确定、且只需要一个方向时，flex 更简单。
**判断口径：要同时对齐行与列用 grid，只对齐一条线用 flex。**`,
   },

   {
      slug: 'custom-properties',
      title: '自定义属性',
      summary: '运行时可读写的变量，主题切换靠的就是它',
      coverPreset: 'violet',
      body: `自定义属性（CSS 变量）和 Sass 变量最大的区别：**它是运行时的，能被 JavaScript 读写，也能被层叠。**

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

组件样式里**一行主题判断都不写**：换主题只是换了一组变量值。

## 只覆盖变量

深色主题的整个实现可以只有十几行：在 \`html[data-theme='dark']\` 里重新声明变量。
所有用 \`var(--card)\` 的地方自动跟着变——这也意味着**没走变量的硬编码颜色会漏掉**，
所以「可主题化」的前提是把颜色都收敛成变量。

## 动手一遍

<Problem baseId={7} />`,
   },

   {
      slug: 'dark-mode',
      title: '深色模式的三个坑',
      summary: '纯黑背景、图片、以及刷新后闪一下',
      coverPreset: 'aurora',
      body: `主题切换做出来只是第一步，这一篇记三个上线后才会暴露的坑。

## 三个坑

- **不要用纯黑**：\`#000\` 配白字在 OLED 上会「拖影」，用 \`#10151c\` 这类偏蓝的近黑更耐看
- **图片要降亮度**：深色背景上的截图会刺眼，\`filter: brightness(.85)\` 就够
- **闪一下**：主题是在脚本里读的，脚本放在 \`<body>\` 末尾就会先渲染浅色再跳深色；把读取逻辑放进 \`<head>\` 里的同步脚本

\`\`\`html
<script>
   const saved = localStorage.getItem('theme');
   if (saved === 'dark' || saved === 'light') {
      document.documentElement.dataset.theme = saved;
   }
</script>
\`\`\`
`,
   },

   {
      slug: 'specificity',
      title: '优先级与层叠',
      summary: '为什么你的样式没生效',
      coverPreset: 'mint',
      body: `「样式没生效」九成是优先级问题，而不是浏览器坏了。

## 权重怎么算

按 \`(id, class, 元素)\` 三元组比较：

- 内联样式 > 任何选择器
- \`#id\`（1,0,0）> \`.class\` / \`[attr]\` / \`:hover\`（0,1,0）> \`div\`（0,0,1）
- \`* \` 与组合符（\`>\`、\`+\`、\`~\`）不增加权重

## 主动降低权重

\`:where()\` 的权重是 0，\`:is()\` 取参数里最高的那个：

\`\`\`css
/* 权重 (0,1,0)，别人很难覆盖 */
.card .title { color: red; }

/* 权重 (0,0,0)，第三方样式随手就能改 */
:where(.card) .title { color: red; }
\`\`\`

> 写组件库时优先用 \`:where()\`：把「能不能被覆盖」的决定权还给使用方。`,
   },

   {
      slug: 'attribute-selectors',
      title: '属性选择器',
      summary: '[data-theme] 这种写法为什么好用',
      coverPreset: 'slate',
      body: `属性选择器把「状态」直接写进选择器，非常适合配合 \`data-*\` 使用。

## 常用三种

\`\`\`css
[data-theme='dark'] { /* 完全匹配 */ }
[data-theme] { /* 存在即可 */ }
[data-name^='keyboard'] { /* 前缀匹配 */ }
\`\`\`

## 为什么用属性而不是类名

- 属性值可以带语义（\`data-theme="dark"\`），JS 读写就是 \`dataset.theme\`
- 布尔状态可以用「有没有这个属性」表达，不用在两个类名之间切
- 选择器写起来短，也更好在 DevTools 里搜
`,
   },

   /* ================= JavaScript ================= */

   {
      slug: 'node-operations',
      title: '节点操作',
      summary: '建节点、插节点、改文本的三件套',
      coverPreset: 'mint',
      body: `DOM 操作只有三个动作，记住它们就能写出绝大多数列表渲染。

## 三件套

- 建：\`document.createElement(tag)\`
- 填：\`element.textContent = '…'\`（要插标签才用 \`innerHTML\`）
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

## 读数据，不要猜数据

<Problem baseId={6} />`,
   },

   {
      slug: 'event-delegation',
      title: '事件委托',
      summary: '为什么给容器挂一个监听就够了',
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

- \`event.target\` 可能是子元素，所以要用 \`closest()\` 找真正想处理的那一层
- 动态插入的新行**不需要重新绑定**——这是委托最大的收益

> 表单控件的值变化用 \`input\` 事件而不是 \`change\`：\`change\` 要等失焦才触发，
> 实时计算合计会慢半拍。`,
   },

   {
      slug: 'local-storage',
      title: '本地存储',
      summary: 'localStorage 的边界与 JSON 往返',
      coverPreset: 'slate',
      body: `localStorage 只能存字符串，且永远同步。这两条决定了它的用法。

## 基本往返

\`\`\`js
localStorage.setItem('theme', 'dark');

const theme = localStorage.getItem('theme'); // 'dark'，拿不到就是 null
\`\`\`

存对象要先 \`JSON.stringify\`，读回来要 \`JSON.parse\`，并且**要处理解析失败**
（用户手改过、旧版本格式变了）：

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

- 同源共享、永久保存（除非用户清）；会话级数据用 \`sessionStorage\`
- 同步 API，**别在主线程里存大对象**；大文件交给 IndexedDB
- 隐私模式下可能直接抛异常，写入要 \`try/catch\`

## 动手一遍

<Problem baseId={7} />`,
   },

   {
      slug: 'async-basics',
      title: 'Promise 与 async/await',
      summary: '把回调地狱压成一条直线',
      coverPreset: 'violet',
      body: `异步代码难读的根源不是「异步」，而是**控制流被打散了**。\`async/await\` 把它还原成直线。

## 同一个流程的两种写法

\`\`\`js
// 回调
fetch('/api/user').then((res) =>
   res.json().then((user) => {
      fetch('/api/orders/' + user.id).then((res2) =>
         res2.json().then((orders) => render(orders)),
      );
   },
);

// async/await
const load = async () => {
   const user = await fetch('/api/user').then((res) => res.json());
   const orders = await fetch('/api/orders/' + user.id).then((res) =>
      res.json(),
   );
   render(orders);
};
\`\`\`

## 三个必须知道的点

- \`await\` 只能出现在 \`async\` 函数里（顶层 await 是模块特性）
- 忘记 \`await\` 得到的是 Promise 本身，\`console.log\` 会显示 \`Promise { <pending> }\`
- 错误要用 \`try/catch\` 包住 \`await\`，否则会变成 unhandled rejection
`,
   },

   {
      slug: 'promise-concurrency',
      title: '并发控制',
      summary: 'Promise.all 与「一次最多 3 个」',
      coverPreset: 'aurora',
      body: `并发不是「同时发出去越多越好」。这一篇给出两个常用形状。

## 一起等：Promise.all

\`\`\`js
const [user, orders] = await Promise.all([
   fetch('/api/user').then((r) => r.json()),
   fetch('/api/orders').then((r) => r.json()),
]);
\`\`\`

任意一个 reject，整体 reject —— 这就是「全都成功才算成功」。
允许部分失败时用 \`Promise.allSettled\`。

## 限制并发：分批 + await

\`\`\`js
const inBatches = async (tasks, size = 3) => {
   const results = [];
   for (let i = 0; i < tasks.length; i += size) {
      results.push(...(await Promise.all(tasks.slice(i, i + size).map((t) => t()))));
   }
   return results;
};
\`\`\`

> 面试里常被追问「不用 Promise.all 怎么控制并发」——答案是一个计数器 + 队列，
> 但工程上先写出分批版本通常就够了。`,
   },

   /* ================= 浏览器调试 ================= */

   {
      slug: 'devtools-panels',
      title: '认识调试面板',
      summary: 'Elements / Console / Network 各自解决什么',
      coverPreset: 'mint',
      body: `调试面板不需要背，只需要知道「哪类问题去哪个面板」。

## 三块面板

- **Elements**：看真实的 DOM 与生效的 CSS（划掉的样式 = 被覆盖或非法）
- **Console**：跑一次性表达式、看报错与调用栈
- **Network**：看请求、状态码、耗时与响应体

## 一个常用技巧

在 Elements 里选中节点后，Console 里输入 \`$0\` 就是它：

\`\`\`js
$0.dataset; // 直接看这个元素上的所有 data-*
getComputedStyle($0).backgroundColor; // 拿到最终生效的颜色
\`\`\`

> \`getComputedStyle\` 返回的永远是**解析后的值**：\`var(--card)\` 会变成 \`rgb(22, 29, 38)\`。`,
   },

   {
      slug: 'breakpoints',
      title: '断点与调用栈',
      summary: '不写 console.log 也能知道变量是什么',
      coverPreset: 'slate',
      body: `断点比 \`console.log\` 强的地方：能看到**那一刻的完整现场**。

## 三种断点

- 行断点：在 Sources 里点行号
- 条件断点：右键行号，写 \`i === 3\`，循环里一次不停的调试就靠它
- 代码里写 \`debugger\`：临时、但会在提交前被忘掉

## 调用栈怎么读

从下往上看：最底下是浏览器/框架入口，最上面是当前停下的函数。
中间那几层就是「谁调用了谁」——异步的栈会在 \`await\` 处断开，这是正常的。
`,
   },

   /* ================= Git 与协作 ================= */

   {
      slug: 'commit-message',
      title: '提交信息怎么写',
      summary: '半年后的自己就是你的读者',
      coverPreset: 'slate',
      body: `提交信息不是写给自己今天的，是写给半年后 \`git log\` 里找原因的人的。

## 一个够用的格式

\`\`\`text
<type>(<scope>): <做了什么>

<为什么这么做；不写「怎么做的」>
\`\`\`

常见的 type：\`feat\` / \`fix\` / \`refactor\` / \`docs\` / \`test\` / \`chore\`。

## 两条硬规则

- 标题不超过 50 字符，用祈使句（\`add\` 而不是 \`added\`）
- 一个提交只做一件事：\`git log\` 才能用来二分定位
`,
   },

   {
      slug: 'branch-model',
      title: '分支模型',
      summary: '让主干随时可发布',
      coverPreset: 'ember',
      body: `分支模型的目标只有一个：**主干上的任意一个提交都是可发布的**。

## 最小可用的两条规则

- 功能开分支：\`feat/theme-switch\`，短命名、带类型前缀
- 合回主干前先 rebase：把「边写边改」的噪声压成几个能讲清楚的提交

\`\`\`bash
git switch -c feat/theme-switch
# ... 提交若干次 ...
git fetch origin
git rebase origin/main
git push -u origin feat/theme-switch
\`\`\`

## 冲突与信任

- 冲突是「同一处被两边改过」的信号，先看两边意图再合并，别直接选一边
- 共享分支上不要 force push；只在自己独占的分支上 rebase
`,
   },

   {
      slug: 'merge-conflicts',
      title: '处理一次合并冲突',
      summary: '看懂冲突标记，再动手',
      coverPreset: 'violet',
      body: `冲突并不可怕，它只是 Git 说「这里我拿不准，你来定」。

## 冲突标记怎么读

\`\`\`text
<<<<<<< HEAD
const timeout = 3000;
=======
const timeout = 5000;
>>>>>>> feat/slow-network
\`\`\`

- \`<<<<<<<\` 到 \`=======\` 之间：当前分支（这里是 HEAD）
- \`=======\` 到 \`>>>>>>>\` 之间：合进来的那一方

## 处理步骤

1. 打开文件，保留正确的内容，**删掉三行标记**
2. 搜索一遍 \`<<<<<<<\`，确认没有漏
3. \`git add\` 冲突文件，\`git rebase --continue\`（或 \`git merge --continue\`）

> 慌的时候 \`git status\` 会告诉你还剩哪些文件没处理。`,
   },
];

/* ---------- 专题（引用文章，归属课程） ---------- */

export interface SeedTopic {
   slug: string;
   courseSlug: string;
   name: string;
   description: string;
   weight: number;
   prerequisites: string[];
   articleSlugs: string[];
   coverPreset: ArticleCoverPreset;
}

export const SEED_TOPICS: SeedTopic[] = [
   {
      slug: 'document-structure',
      courseSlug: 'html',
      name: '文档结构',
      description: '先弄清文档是怎么被解析成一棵树的，再谈标签怎么写。',
      weight: 10,
      prerequisites: [],
      articleSlugs: ['document-tree', 'parsing-is-forgiving'],
      coverPreset: 'ember',
   },
   {
      slug: 'tags',
      courseSlug: 'html',
      name: '标签',
      description: '语义化标签与可访问性：同一个视觉结果，只有一种写法是对的。',
      weight: 20,
      prerequisites: ['document-structure'],
      articleSlugs: ['semantic-tags', 'forms-and-a11y'],
      coverPreset: 'slate',
   },
   {
      slug: 'layout',
      courseSlug: 'css',
      name: '布局',
      description: 'flex 与 grid 是两篇独立的文章，不是同一篇里的两节。',
      weight: 10,
      prerequisites: [],
      articleSlugs: ['flex-layout', 'grid-layout'],
      coverPreset: 'aurora',
   },
   {
      slug: 'variables',
      courseSlug: 'css',
      name: '变量',
      description: '自定义属性是运行时可读写的，主题切换靠的就是它。',
      weight: 20,
      prerequisites: ['layout'],
      articleSlugs: ['custom-properties', 'dark-mode'],
      coverPreset: 'violet',
   },
   {
      slug: 'selectors',
      courseSlug: 'css',
      name: '选择器',
      description: '优先级、层叠，以及用 :where() 主动降低权重。',
      weight: 30,
      prerequisites: ['layout'],
      articleSlugs: ['specificity', 'attribute-selectors'],
      coverPreset: 'mint',
   },
   {
      slug: 'dom',
      courseSlug: 'javascript',
      name: 'DOM',
      description: '节点操作与事件模型，浏览器里最基础的一套 API。',
      weight: 10,
      prerequisites: [],
      articleSlugs: ['node-operations', 'event-delegation'],
      coverPreset: 'mint',
   },
   {
      slug: 'bom',
      courseSlug: 'javascript',
      name: 'BOM',
      description: 'localStorage 与它之外的选择，浏览器给的那几个全局对象。',
      weight: 20,
      prerequisites: ['dom'],
      articleSlugs: ['local-storage'],
      coverPreset: 'slate',
   },
   {
      slug: 'async',
      courseSlug: 'javascript',
      name: '异步',
      description: 'Promise、并发控制，卡人的地方都在这。',
      weight: 30,
      prerequisites: ['dom'],
      articleSlugs: ['async-basics', 'promise-concurrency'],
      coverPreset: 'violet',
   },
   {
      slug: 'devtools',
      courseSlug: 'devtools',
      name: '调试面板',
      description: '不改代码就能看清页面到底发生了什么。',
      weight: 10,
      prerequisites: [],
      articleSlugs: ['devtools-panels', 'breakpoints'],
      coverPreset: 'mint',
   },
   {
      slug: 'commit',
      courseSlug: 'git',
      name: '提交规范',
      description: '提交信息是写给半年后的自己看的。',
      weight: 10,
      prerequisites: [],
      articleSlugs: ['commit-message'],
      coverPreset: 'slate',
   },
   {
      slug: 'branch',
      courseSlug: 'git',
      name: '分支与合并',
      description: '让主干随时可发布，冲突来了也别慌。',
      weight: 20,
      prerequisites: ['commit'],
      articleSlugs: ['branch-model', 'merge-conflicts'],
      coverPreset: 'ember',
   },
];

/* ---------- 课程（集合专题） ---------- */

export interface SeedCourse {
   slug: string;
   name: string;
   description: string;
   weight: number;
   coverPreset: ArticleCoverPreset;
}

export const SEED_COURSES: SeedCourse[] = [
   {
      slug: 'html',
      name: 'HTML',
      description:
         '网页的结构层。从文档树讲到标签与可访问性，学完能独立写出一份语义正确的页面骨架。',
      weight: 10,
      coverPreset: 'ember',
   },
   {
      slug: 'css',
      name: 'CSS',
      description:
         '网页的表现层。布局、变量与选择器三条线并行，变量是主题化的地基。',
      weight: 20,
      coverPreset: 'aurora',
   },
   {
      slug: 'javascript',
      name: 'JavaScript',
      description: '网页的行为层。DOM、BOM 与异步三块，异步是分水岭。',
      weight: 30,
      coverPreset: 'violet',
   },
   {
      slug: 'devtools',
      name: '浏览器调试',
      description: '定位样式、下断点、读调用栈——不改代码也能看清发生了什么。',
      weight: 40,
      coverPreset: 'mint',
   },
   {
      slug: 'git',
      name: 'Git 与协作',
      description: '提交信息、分支模型与冲突处理。一个人写也要按能协作的方式写。',
      weight: 50,
      coverPreset: 'slate',
   },
];

/* ---------- id 分配：初始内容按数组顺序取号，运行时新增的往后排 ---------- */

export const SEED_ID_BASE = 100;
export const SEED_TOPIC_ID_BASE = 1000;
export const SEED_COURSE_ID_BASE = 5000;

export const seedArticleId = (index: number) => SEED_ID_BASE + index + 1;
export const seedTopicId = (index: number) => SEED_TOPIC_ID_BASE + index + 1;
export const seedCourseId = (index: number) => SEED_COURSE_ID_BASE + index + 1;
