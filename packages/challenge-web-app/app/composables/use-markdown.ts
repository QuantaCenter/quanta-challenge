import { marked, Renderer } from 'marked';
import githubDark from 'shiki/themes/github-dark.mjs';
import langBash from 'shiki/langs/bash.mjs';
import langCss from 'shiki/langs/css.mjs';
import langHtml from 'shiki/langs/html.mjs';
import langJavaScript from 'shiki/langs/javascript.mjs';
import langJson from 'shiki/langs/json.mjs';
import langMarkdown from 'shiki/langs/markdown.mjs';
import langTypeScript from 'shiki/langs/typescript.mjs';
import langVue from 'shiki/langs/vue.mjs';
import { useShiki } from './use-shiki';

/** 代码块语言栏右侧的两个图标：默认复制，点完切成对勾 */
const CODE_COPY_ICON =
   '<svg class="article-code__icon article-code__icon-copy" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>';
const CODE_CHECK_ICON =
   '<svg class="article-code__icon article-code__icon-check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5 9.5 17.5 19.5 6.5"></path></svg>';

const escapeAttribute = (value: string) =>
   value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

/** 给代码块加一条语言栏（左：语言，右：复制按钮） */
const wrapCodeBlock = (body: string, language: string) =>
   `<div class="article-code"><div class="article-code__bar"><span class="article-code__lang">${escapeAttribute(
      language,
   )}</span><button type="button" class="article-code__copy" aria-label="复制代码" title="复制代码">${CODE_COPY_ICON}${CODE_CHECK_ICON}</button></div>${body}</div>`;

/** 文章正文里可能出现的语言；没登记的会退回纯文本 */
const CODE_LANGUAGES = [
   langHtml,
   langCss,
   langJavaScript,
   langTypeScript,
   langJson,
   langBash,
   langMarkdown,
   langVue,
];

export const useMarkdown = (options?: { codeHeader?: boolean }) => {
   const containerKey = 'markdown-container';
   const container = useTemplateRef<HTMLElement>(containerKey);
   const html = ref('');

   let hasMounted = false;

   const withCodeHeader = options?.codeHeader ?? false;

   // 主题必须和下面 codeToHtml 用的一致，否则会被当成未注册主题
   const { highlighter } = useShiki({
      theme: githubDark,
      languages: CODE_LANGUAGES,
   });

   const renderer = new Renderer();

   renderer.code = ({ text, lang }) => {
      const language = lang || 'text';
      let body: string;

      if (!highlighter.value) {
         body = `<pre><code>${text}</code></pre>`;
      } else {
         try {
            body = highlighter.value.codeToHtml(text, {
               lang: language as any,
               theme: 'github-dark',
            });
         } catch {
            body = `<pre><code>${text}</code></pre>`;
         }
      }

      return withCodeHeader ? wrapCodeBlock(body, language) : body;
   };

   const update = (content: string) => {
      // 同步渲染：SSR 阶段（在 setup 里调用）也要立刻拿到 HTML；
      // 代码高亮依赖 shiki，服务端没有，退回纯 <pre><code>。
      html.value = marked.parse(content, {
         gfm: true,
         breaks: true,
         renderer: renderer,
      }) as string;
      if (hasMounted && container.value) {
         container.value.innerHTML = html.value;
      }
   };

   onMounted(() => {
      if (hasMounted) return;
      hasMounted = true;
      if (html.value && container.value) {
         container.value.innerHTML = html.value;
      }
   });

   return {
      containerKey,
      html,
      update,
   };
};
