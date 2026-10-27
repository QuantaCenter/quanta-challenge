import { marked, Renderer } from 'marked';
import githubDark from 'shiki/themes/github-dark.mjs';
import { useShiki } from './use-shiki';
import langBash from 'shiki/langs/bash.mjs';
import langCss from 'shiki/langs/css.mjs';
import langHtml from 'shiki/langs/html.mjs';
import langJavascript from 'shiki/langs/javascript.mjs';
import langJson from 'shiki/langs/json.mjs';
import langMarkdown from 'shiki/langs/markdown.mjs';
import langTypescript from 'shiki/langs/typescript.mjs';
import langVue from 'shiki/langs/vue.mjs';

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
   langJavascript,
   langTypescript,
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
      theme: withCodeHeader ? (githubDark as any) : undefined,
      languages: CODE_LANGUAGES,
   });

   const themeName = withCodeHeader ? 'github-dark' : 'ayu-dark';

   const renderer = new Renderer();

   // HTML 实体转义，防止描述中的原生 HTML 被 v-html 渲染执行
   const escapeHtml = (text: string) =>
      text
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#39;');

   renderer.code = ({ text, lang }) => {
      const language = lang || 'text';
      let body: string;

      if (!highlighter.value) {
         body = `<pre><code>${escapeHtml(text)}</code></pre>`;
      } else {
         try {
            body = highlighter.value.codeToHtml(text, {
               lang: language as any,
               theme: themeName as any,
            });
         } catch {
            body = `<pre><code>${escapeHtml(text)}</code></pre>`;
         }
      }

      return withCodeHeader ? wrapCodeBlock(body, language) : body;
   };

   // 代码块以外的原生 HTML 一律转义为代码展示
   renderer.html = ({ text, block }) =>
      block
         ? `<pre><code>${escapeHtml(text)}</code></pre>`
         : `<code>${escapeHtml(text)}</code>`;

   let lastContent = '';

   const update = (content: string) => {
      // 同步渲染：SSR 阶段也要立刻拿到 HTML，服务端退回纯代码块
      lastContent = content;
      html.value = marked.parse(content, {
         gfm: true,
         breaks: true,
         renderer: renderer,
      }) as string;
      if (hasMounted && container.value) {
         container.value.innerHTML = html.value;
      }
   };

   // Shiki 初始化完成后重渲染，补上挂载前那次解析缺失的高亮
   watch(highlighter, (h) => {
      if (h && lastContent) update(lastContent);
   });

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
