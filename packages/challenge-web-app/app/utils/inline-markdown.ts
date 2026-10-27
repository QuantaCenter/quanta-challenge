/**
 * 正文里的**行内** Markdown → HTML。
 *
 * 为什么需要它：文章正文由自己的解析器切成方块（`ContentBlock`），
 * 模板里直接用 `{{ text }}` 输出纯文本，于是 `` `feat/theme-switch` `` 这种
 * 行内代码会把反引号原样显示出来。把行内语法在这一层转成标签，
 * 模板再用 `v-html` 输出即可。
 *
 * 安全口径：**先整段转义**，再只把本文件自己生成的少数标签放回来。
 * 正文来自管理员，但注释、删除线这些语法里可以夹带 `<script>`，
 * 「白名单放行」比「黑名单过滤」可靠。
 */

/**
 * 白名单放行的标签。
 *
 * `<ArticleText size="…">` 这里刻意接受**任意档位名**（`[\w-]+`），
 * 未知档位由下面的 `SIZE_CLASS[size] ?? SIZE_CLASS.base` 退回 base：
 * 手写一个 `size="huge"` 时，结果应该是"按默认字号显示"，而不是把整段
 * 标签原样吐到页面上（那看起来就像渲染坏了）。
 */
const TAG_WHITELIST =
   /&lt;(\/?)(strong|em|code|del|br)(\s*\/?)&gt;|&lt;ArticleText\s+size=&quot;([\w-]+)&quot;&gt;|&lt;\/ArticleText&gt;/g;

/**
 * 字号档位 → 类名。**编辑器预览与文章页共用这一份**
 * （编辑器从本文件导入，别再各写一份——漂移过：编辑器用原子类、文章页用这套，
 * 而这套当时没有样式定义，表现为"发布后字号不变"）。
 *
 * 样式定义在 `app/assets/css/tailwind.css` 的 `.article-text-*`。
 */
export const ARTICLE_TEXT_SIZE_CLASS: Record<string, string> = {
   sm: 'article-text-sm',
   base: 'article-text-base',
   lg: 'article-text-lg',
};

const SIZE_CLASS = ARTICLE_TEXT_SIZE_CLASS;

const escapeHtml = (text: string): string =>
   text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

const restoreTags = (escaped: string): string =>
   escaped.replace(
      TAG_WHITELIST,
      (match, closing: string, tag: string, selfClose: string, size: string) => {
         if (tag) return `<${closing}${tag}${selfClose}>`;
         if (match.startsWith('&lt;/')) return '</span>';
         return `<span class="${SIZE_CLASS[size] ?? SIZE_CLASS.base}">`;
      },
   );

/**
 * 段落级渲染：与编辑器预览（marked，`gfm: true, breaks: true`）对齐。
 *
 * `breaks: true` 的语义是「段内的单个换行也换行」，所以这里按 `\n` 拆开、
 * 用 `<br>` 连接 —— 否则同一篇正文在编辑器里换行、在文章页却挤成一行。
 */
export const renderParagraph = (text: string): string =>
   text
      .split('\n')
      .map((line) => renderInline(line))
      .join('<br>');

/** 行内 Markdown → 安全的 HTML 片段 */
export const renderInline = (text: string): string => {
   let out = escapeHtml(text);

   // 行内代码最先处理：里面的 `*` `_` 不该再被当成强调语法
   const codes: string[] = [];
   out = out.replace(/`([^`]+)`/g, (_match, code: string) => {
      codes.push(code);
      return `\u0000${codes.length - 1}\u0000`;
   });

   out = out
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');

   out = out.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => {
      // 代码内容刚才是转义过的，这里直接嵌进 <code> 即可
      return `<code>${codes[Number(index)]}</code>`;
   });

   return restoreTags(out);
};

/**
 * HTML 片段 → 行内 Markdown 源码。
 *
 * `renderInline` 的逆操作，用于「从方块反推 Markdown 源码」这条退化路径
 * （文章没有存 `source` 时才走）。不还原就会出现 `**&lt;strong&gt;x&lt;/strong&gt;**`
 * 这种二次转义。
 */
export const unrenderInline = (html: string): string =>
   html
      .replace(/<code>([\s\S]*?)<\/code>/g, (_m, inner: string) => `\`${inner}\``)
      .replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1**')
      .replace(/<em>([\s\S]*?)<\/em>/g, '*$1*')
      .replace(/<del>([\s\S]*?)<\/del>/g, '~~$1~~')
      .replace(/<span class="article-text-(?:sm|base|lg)">([\s\S]*?)<\/span>/g, '$1')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
