import { marked, Renderer } from 'marked';
import { useShiki } from './use-shiki';
import langBash from 'shiki/langs/bash.mjs';
import langCss from 'shiki/langs/css.mjs';
import langHtml from 'shiki/langs/html.mjs';
import langJavascript from 'shiki/langs/javascript.mjs';
import langJson from 'shiki/langs/json.mjs';
import langTypescript from 'shiki/langs/typescript.mjs';

export const useMarkdown = () => {
   const containerKey = 'markdown-container';
   const container = useTemplateRef<HTMLElement>(containerKey);
   const html = ref('');

   let hasMounted = false;

   const { highlighter } = useShiki({
      languages: [
         langHtml,
         langCss,
         langJavascript,
         langTypescript,
         langJson,
         langBash,
      ],
   });

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
      if (!highlighter.value) {
         return `<pre><code>${escapeHtml(text)}</code></pre>`;
      }
      try {
         return highlighter.value.codeToHtml(text, {
            lang: (lang || 'text') as any,
            theme: 'ayu-dark',
         });
      } catch (e) {
         return `<pre><code>${escapeHtml(text)}</code></pre>`;
      }
   };

   // 代码块以外的原生 HTML 一律转义为代码展示
   renderer.html = ({ text, block }) =>
      block
         ? `<pre><code>${escapeHtml(text)}</code></pre>`
         : `<code>${escapeHtml(text)}</code>`;

   let lastContent = '';

   const update = async (content: string) => {
      lastContent = content;
      html.value = await marked.parse(content, {
         gfm: true,
         breaks: true,
         renderer: renderer,
      });
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
