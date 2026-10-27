/** 正文行内 Markdown 转 HTML，先整段转义再白名单放行 */

/** 白名单放行的标签，未知档位退回 base */
const TAG_WHITELIST =
   /&lt;(\/?)(strong|em|code|del|br)(\s*\/?)&gt;|&lt;ArticleText\s+size=&quot;([\w-]+)&quot;&gt;|&lt;\/ArticleText&gt;/g;

/** 字号档位 → 类名，编辑器预览与文章页共用 */
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
