/**
 * 把题面 markdown 压成单行纯文本，专供 `<meta name="description">` / `og:description`。
 *
 * 为什么不能直接把 markdown 塞进 head（曾导致做题页顶部多出一段乱码文本）：
 *
 *   1. 题面里出现 `<style>` / `<script>` 是常态，CSS 题尤甚。
 *      unhead 的 `encodeAttribute` 只把 `"` 转成 `&quot;`，**不转义 `<`**
 *      （见 unhead/dist/server.mjs 的 encodeAttribute），于是裸标签会原样留在属性值里：
 *        <meta property="og:description" content="…只需补全 `<style>` 里的样式。…">
 *   2. nuxt-security 的 40-cspSsrNonce 插件用 `/<style([^>]*?)>/gi` 这类正则
 *      **盲扫整段 HTML**（属性值内部也照扫）并注入 `nonce="…"`，凭空往里塞了一个裸 `"`。
 *   3. 属性被这个 `"` 提前闭合，本该属于 content 的剩余文本成了 `<head>` 里的非空白文本，
 *      HTML 解析器会把它移进 `<body>`，页面上就多出
 *      “` 里的样式。判分关注的行为：- 卡” 这样一段文本
 *      （`description` 和 `og:description` 各断一次，所以会出现两遍）。
 *
 * 结论：进入 head 之前先剥掉所有标签类内容，只留下可读文本。
 *
 * @param markdown 原始 markdown（允许为空）
 * @returns 单行纯文本，不再含任何 HTML 解析器会认作标签起始的 `<`
 */
export const toSeoText = (markdown?: string | null): string => {
   if (!markdown) {
      return '';
   }

   return (
      markdown
         // 围栏代码块：整段丢弃（题目正文里的示例往往就是答案本身）
         .replace(/```[\s\S]*?```/g, ' ')
         // 缩进式代码块
         .replace(/^(?: {4}|\t).*$/gm, ' ')
         // 行内代码：`<style>` 这类裸标签主要就藏在这里。
         // 不整段丢弃——否则“只需补全 `<style>` 里的样式”会变成“只需补全 里的样式”
         // ——只把尖括号去掉，既保留可读文字，又不再有标签形态。
         .replace(/`([^`\n]*)`/g, (_, code: string) => ` ${code.replace(/[<>]/g, '')} `)
         // 强调记号去壳（只处理 `**` / `*`，不动 `_`，否则 snake_case 会被腰斩）
         .replace(/\*\*([^*\n]+)\*\*/g, '$1')
         .replace(/\*([^*\n]+)\*/g, '$1')
         // HTML 注释
         .replace(/<!--[\s\S]*?-->/g, ' ')
         // 成对的裸标签（要求 `<` 后紧跟字母，避免把 "a < b 且 c > d" 这类正文吃掉）
         .replace(/<\/?[a-zA-Z][^<>]*>/g, ' ')
         // 兜底：残缺写法（如只写了 `<style` 没有闭合）同样必须清掉。
         // 凡是 HTML 解析器会当成标签起始的 `<`（后面跟字母或 `/`）都不允许留下 ——
         // nuxt-security 的 nonce 插件就是拿 /<style|<script|<link/ 这类正则盲扫的。
         .replace(/<(?=[a-zA-Z/])/g, ' ')
         // 图片整段丢弃，链接只保留可见文字
         .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
         .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
         // 下面只处理**行首**的 markdown 结构记号。
         // 不做全局标点清洗：`C#`、`*.vue`、`~100ms`、`user_name`、`Web-Container`
         // 都是正常正文，它们在 meta 里没有任何危害（真正有危害的只有 `<`）。
         .replace(/^\s*#{1,6}\s+/gm, ' ') // 标题
         .replace(/^[ \t]*[-+*]\s+/gm, ' ') // 列表
         .replace(/^[ \t]*>[ \t]?/gm, ' ') // 引用
         .replace(/^[ \t]*([-*_])[ \t]*(?:\1[ \t]*){2,}$/gm, ' ') // 分隔线
         // 折叠所有空白：换行留在属性值里会让 head 输出难以排查
         .replace(/\s+/g, ' ')
         .trim()
   );
};
