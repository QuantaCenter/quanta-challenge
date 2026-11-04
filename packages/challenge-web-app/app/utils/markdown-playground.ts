import type { Tokens, TokenizerAndRendererExtension } from 'marked';

/** 文章正文里的静态演练块：`<Playground>` 标签解析 + 预览文档拼装。 */

export type TPlaygroundLanguage = 'html' | 'css' | 'javascript';

export interface IPlaygroundFile {
   /** 文件标签文案 */
   name: string;
   language: TPlaygroundLanguage;
   code: string;
}

/** auto：有输出时自动显示；show：默认显示；hide：默认隐藏，仅报错时显示 */
export type TPlaygroundConsole = 'auto' | 'show' | 'hide';

export interface IPlaygroundSpec {
   title: string;
   /** 源码指纹，正文变化时用于强制重建组件 */
   signature: string;
   /** 输出区高度（CSS 长度）：有预览时为预览高度，否则为控制台高度 */
   height: string;
   /** 编辑器高度（CSS 长度） */
   editorHeight: string;
   /** PC 端默认布局（移动端默认上下）；学员可在组件右上角切换，容器过窄时固定为上下 */
   layout: 'horizontal' | 'vertical';
   /** 是否展示预览；关闭后控制台成为唯一输出区 */
   preview: boolean;
   console: TPlaygroundConsole;
   files: IPlaygroundFile[];
}

const PLAYGROUND_BLOCK_PATTERN =
   /^<Playground([^>]*)>[ \t]*\r?\n([\s\S]*?)\r?\n?[ \t]*<\/Playground>[ \t]*(?:\r?\n|$)/;

const PLAYGROUND_START_PATTERN = /^<Playground[\s>]/m;

const ATTRIBUTE_PATTERN = /([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const FENCE_PATTERN =
   /^[ \t]*(`{3,}|~{3,})[ \t]*([A-Za-z][\w+#-]*)?[^\n]*\r?\n([\s\S]*?)\r?\n?[ \t]*\1[ \t]*(?=\r?\n|$)/gm;

const LANGUAGE_ALIASES: Record<string, TPlaygroundLanguage> = {
   html: 'html',
   markup: 'html',
   xml: 'html',
   css: 'css',
   js: 'javascript',
   mjs: 'javascript',
   javascript: 'javascript',
};

const FILE_NAMES: Record<TPlaygroundLanguage, string> = {
   html: 'index.html',
   css: 'style.css',
   javascript: 'script.js',
};

const FILE_ORDER: TPlaygroundLanguage[] = ['html', 'css', 'javascript'];

const PLACEHOLDER_PREFIX = 'st-playground';

const PLACEHOLDER_SPLIT_PATTERN = new RegExp(`<!--${PLACEHOLDER_PREFIX}:(\\d+)-->`);

/** 宿主与预览 iframe 之间的消息标识 */
export const PLAYGROUND_MESSAGE_SOURCE = 'st-playground-preview';

/**
 * 预览 iframe 里最先执行的桥接脚本：把 console、运行错误与 CSP 拦截回传给宿主。
 *
 * 另外防止预览跳出演练文档。srcdoc 文档的相对地址按父页面解析：`#id` 会变成「文章页地址#id」，
 * `/path`、空 href、表单的相对 action 都指向本站，跳转后会把网站页面整个载入预览。
 * - 页内锚点：改为在 iframe 自身地址上替换片段，只在预览内滚动，`:target` 与 hashchange
 *   照常生效，也不会给文章页增加历史记录。
 * - 站内链接 / 表单提交：拦截并在控制台提示。
 * 作者自己 preventDefault、新窗口打开、带修饰键的点击、下载链接与 method="dialog" 不受影响。
 *
 * 脚本发起的跳转（`location.href = ...`、`form.submit()`）无法提前拦截：沙箱文档是不透明源，
 * Navigation API 不派发事件。因此文档就绪时上报 ready、卸载时上报 leave，由宿主发现预览已离开
 * 演练文档后重建（见 `createPreviewLeaveGuard`）。站外链接与表单属于作者有意为之，leave 时标记放行。
 */
const PREVIEW_BRIDGE = `(function(){
var post=function(data){data.source='${PLAYGROUND_MESSAGE_SOURCE}';try{parent.postMessage(data,'*')}catch(e){}};
var send=function(level,text){post({level:level,text:text})};
var inspect=function(v,depth,seen){
if(v===null)return 'null';
var t=typeof v;
if(t==='string')return depth?"'"+v+"'":v;
if(t==='bigint')return String(v)+'n';
if(t!=='object'&&t!=='function')return String(v);
if(t==='function')return '[Function '+(v.name||'(anonymous)')+']';
if(v instanceof Error)return v.stack||(v.name+': '+v.message);
if(typeof Element!=='undefined'&&v instanceof Element)return '<'+v.tagName.toLowerCase()+(v.id?'#'+v.id:'')+'>';
if(v instanceof Date)return v.toISOString();
if(seen.indexOf(v)>=0)return '[Circular]';
if(depth>2)return Array.isArray(v)?'[Array]':'[Object]';
seen=seen.concat([v]);
var inner=function(x){return inspect(x,depth+1,seen)};
if(Array.isArray(v))return v.length?'[ '+v.map(inner).join(', ')+' ]':'[]';
if(v instanceof Map)return 'Map('+v.size+') { '+Array.from(v).map(function(e){return inner(e[0])+' => '+inner(e[1])}).join(', ')+' }';
if(v instanceof Set)return 'Set('+v.size+') { '+Array.from(v).map(inner).join(', ')+' }';
var keys=Object.keys(v);
var name=v.constructor&&v.constructor!==Object&&v.constructor.name?v.constructor.name+' ':'';
return keys.length?name+'{ '+keys.map(function(k){return k+': '+inner(v[k])}).join(', ')+' }':name+'{}';
};
var format=function(value){try{return inspect(value,0,[])}catch(e){return String(value)}};
var join=function(args){return Array.prototype.map.call(args,format).join(' ')};
['log','info','warn','error','debug'].forEach(function(level){
var original=console[level];
console[level]=function(){send(level==='debug'?'log':level,join(arguments));if(original)original.apply(console,arguments)}
});
window.addEventListener('error',function(event){send('error',event.message||format(event.error))});
window.addEventListener('unhandledrejection',function(event){send('error','Unhandled rejection: '+format(event.reason))});
document.addEventListener('securitypolicyviolation',function(event){
send('warn','被页面安全策略拦截：'+event.violatedDirective+'（'+(event.blockedURI||'inline')+'）')
});
var siteOrigin='';
try{siteOrigin=new URL(document.baseURI).origin}catch(e){}
var allowLeave=false;
var classify=function(raw){
var url;
try{url=new URL(raw,document.baseURI)}catch(e){return 'other'}
if(siteOrigin&&siteOrigin!=='null'&&url.origin===siteOrigin)return 'site';
return /^https?:$/.test(url.protocol)?'external':'other';
};
var isSelf=function(target){target=(target||'').trim().toLowerCase();return !target||target==='_self'};
var SITE_HINT='站内地址会把网站页面载入预览';
window.addEventListener('click',function(event){
if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
var link=event.target&&event.target.closest?event.target.closest('a[href],area[href]'):null;
if(!link||link.hasAttribute('download')||!isSelf(link.getAttribute('target')))return;
var href=(link.getAttribute('href')||'').trim();
if(href.charAt(0)==='#'){
event.preventDefault();
location.replace(location.href.split('#')[0]+href);
return;
}
var kind=classify(href);
if(kind==='site'){
event.preventDefault();
send('warn','已拦截跳转：'+(href||'（空地址）')+'。'+SITE_HINT+'，页内定位请使用 #id');
return;
}
if(kind==='external')allowLeave=true;
});
window.addEventListener('submit',function(event){
if(event.defaultPrevented)return;
var form=event.target,submitter=event.submitter;
if(!form||!form.getAttribute)return;
var pick=function(override,attr){return submitter&&submitter.hasAttribute&&submitter.hasAttribute(override)?submitter.getAttribute(override):form.getAttribute(attr)};
if((pick('formmethod','method')||'').trim().toLowerCase()==='dialog'||!isSelf(pick('formtarget','target')))return;
var action=(pick('formaction','action')||'').trim();
if(!action)return;
var kind=classify(action);
if(kind==='site'){
event.preventDefault();
send('warn','已拦截表单提交：'+action+'。'+SITE_HINT+'，可在 submit 事件中调用 event.preventDefault()');
return;
}
if(kind==='external')allowLeave=true;
});
window.addEventListener('pagehide',function(){post({type:'leave',allowed:allowLeave,frame:window.name});allowLeave=false});
post({type:'ready'});
})();`;

/** 预览离开演练文档后，等待新文档上报 ready 的最长时间 */
const LEAVE_TIMEOUT = 1500;
/** 新文档 load 后仍未收到 ready 时再等的时间：Chromium 中 ready 可能晚于 load 到达 */
const LOAD_GRACE = 300;

/**
 * 宿主侧的离开守卫：桥接脚本在文档卸载时上报 leave，新的演练文档就绪时上报 ready。
 * leave 之后迟迟等不到 ready，说明 iframe 已载入别的页面（脚本跳转、form.submit() 等），
 * 由 `onEscape` 负责重建预览；重新载入演练文档本身（如无 action 的表单、location.reload()）不受影响。
 *
 * leave 在文档卸载时发出，Chromium 中到达宿主时 `event.source` 已为 null，
 * 因此消息里带上 iframe 的 name（`frame`），宿主据此识别来源。
 */
export const createPreviewLeaveGuard = (
   onEscape: () => void,
   { timeout = LEAVE_TIMEOUT, grace = LOAD_GRACE } = {},
) => {
   let leaving = false;
   let timer: ReturnType<typeof setTimeout> | undefined;

   const clear = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
   };
   const arm = (delay: number) => {
      clear();
      timer = setTimeout(() => {
         timer = undefined;
         if (!leaving) return;
         leaving = false;
         onEscape();
      }, delay);
   };

   return {
      /** 演练文档卸载；allowed 为 true 表示作者有意打开站外页面 */
      leave(allowed = false) {
         if (allowed) return;
         leaving = true;
         arm(timeout);
      },
      /** 新的演练文档已执行桥接脚本 */
      ready() {
         leaving = false;
         clear();
      },
      /** iframe 触发 load */
      load() {
         if (leaving) arm(grace);
      },
      /** 重新运行或组件卸载 */
      reset() {
         leaving = false;
         clear();
      },
   };
};

const parseAttributes = (raw: string) => {
   const attributes: Record<string, string> = {};
   for (const match of raw.matchAll(ATTRIBUTE_PATTERN)) {
      attributes[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? '';
   }
   return attributes;
};

/** 去掉各行共同的缩进，允许作者把演练块整体缩进书写 */
const dedent = (code: string) => {
   const lines = code.split('\n');
   const indents = lines
      .filter((line) => line.trim())
      .map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0);
   const shortest = indents.length ? Math.min(...indents) : 0;
   return shortest ? lines.map((line) => line.slice(shortest)).join('\n') : code;
};

const toCssLength = (value: string | undefined, fallback: string) => {
   if (!value) return fallback;
   return /^\d+(\.\d+)?$/.test(value) ? `${value}px` : value;
};

/** 把 `<Playground>` 内的围栏代码块收敛成每种语言一个文件 */
export const parsePlaygroundFiles = (body: string): IPlaygroundFile[] => {
   const codes = new Map<TPlaygroundLanguage, string[]>();
   for (const match of body.matchAll(FENCE_PATTERN)) {
      const language = LANGUAGE_ALIASES[(match[2] ?? '').toLowerCase()];
      if (!language) continue;
      const code = dedent(match[3] ?? '').replace(/\s+$/, '');
      if (!code.trim()) continue;
      const bucket = codes.get(language);
      if (bucket) bucket.push(code);
      else codes.set(language, [code]);
   }

   // 没有围栏代码块时，整段按 HTML 处理
   if (!codes.size) {
      const markup = dedent(body).trim();
      return markup
         ? [{ name: FILE_NAMES.html, language: 'html', code: markup }]
         : [];
   }

   return FILE_ORDER.filter((language) => codes.has(language)).map((language) => ({
      name: FILE_NAMES[language],
      language,
      code: codes.get(language)!.join('\n\n'),
   }));
};

/** 按最长文件的行数给编辑器一个合适的默认高度 */
const defaultEditorHeight = (files: IPlaygroundFile[]) => {
   const lines = files.reduce(
      (max, file) => Math.max(max, file.code.split('\n').length),
      0,
   );
   return `${Math.min(Math.max(lines + 1, 7), 22) * 1.375}rem`;
};

/** djb2 字符串散列，仅用于生成组件 key */
const signatureOf = (raw: string) => {
   let hash = 5381;
   for (let index = 0; index < raw.length; index += 1) {
      hash = ((hash << 5) + hash + raw.charCodeAt(index)) | 0;
   }
   return (hash >>> 0).toString(36);
};

export const parsePlayground = (
   attributesRaw: string,
   body: string,
): IPlaygroundSpec => {
   const attributes = parseAttributes(attributesRaw);
   const files = parsePlaygroundFiles(body);
   const hasMarkup = files.some((file) => file.language !== 'javascript');
   const preview =
      attributes.preview === undefined ? hasMarkup : attributes.preview !== 'false';
   const consoleMode: TPlaygroundConsole =
      attributes.console === undefined
         ? 'auto'
         : attributes.console === 'false'
           ? 'hide'
           : 'show';
   return {
      title: attributes.title ?? '',
      signature: signatureOf(`${attributesRaw}\u0000${body}`),
      height: toCssLength(attributes.height, preview ? '16rem' : '9rem'),
      editorHeight: toCssLength(
         attributes.editorheight,
         defaultEditorHeight(files),
      ),
      layout: attributes.layout === 'vertical' ? 'vertical' : 'horizontal',
      preview,
      console: consoleMode,
      files,
   };
};

interface IPlaygroundToken extends Tokens.Generic {
   type: 'stPlayground';
   raw: string;
   attributes: string;
   body: string;
}

/**
 * marked 块级扩展：把 `<Playground>…</Playground>` 解析进 `collect`，
 * 正文位置只留注释占位符，供 `splitMarkdownBlocks` 还原成组件。
 */
export const createPlaygroundExtension = (
   collect: IPlaygroundSpec[],
): TokenizerAndRendererExtension => ({
   name: 'stPlayground',
   level: 'block',
   start: (src: string) => src.match(PLAYGROUND_START_PATTERN)?.index,
   tokenizer(src: string) {
      const match = PLAYGROUND_BLOCK_PATTERN.exec(src);
      if (!match) return undefined;
      const token: IPlaygroundToken = {
         type: 'stPlayground',
         raw: match[0],
         attributes: match[1] ?? '',
         body: match[2] ?? '',
      };
      return token;
   },
   renderer(token: Tokens.Generic) {
      const playground = token as IPlaygroundToken;
      const spec = parsePlayground(playground.attributes, playground.body);
      if (!spec.files.length) return '';
      collect.push(spec);
      return `<!--${PLACEHOLDER_PREFIX}:${collect.length - 1}-->`;
   },
});

export type TMarkdownBlock =
   | { kind: 'html'; html: string }
   | { kind: 'playground'; spec: IPlaygroundSpec };

/** 按占位符把渲染结果切成 HTML 片段与演练块交替的序列 */
export const splitMarkdownBlocks = (
   rendered: string,
   specs: IPlaygroundSpec[],
): TMarkdownBlock[] => {
   const blocks: TMarkdownBlock[] = [];
   rendered.split(PLACEHOLDER_SPLIT_PATTERN).forEach((part, index) => {
      if (index % 2 === 1) {
         const spec = specs[Number(part)];
         if (spec) blocks.push({ kind: 'playground', spec });
         return;
      }
      if (part.trim()) blocks.push({ kind: 'html', html: part });
   });
   return blocks;
};

const escapeClosingTag = (code: string, tag: string) =>
   code.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

/** 把当前代码拼成可直接塞进 iframe srcdoc 的完整文档 */
export const buildPlaygroundDocument = (files: IPlaygroundFile[]) => {
   const pick = (language: TPlaygroundLanguage) =>
      files
         .filter((file) => file.language === language)
         .map((file) => file.code)
         .join('\n\n');

   const markup = pick('html');
   const style = pick('css');
   const script = pick('javascript');

   // 预览滚到底时不把滚动传递给文章页；放在作者样式之前，作者可覆盖
   const bridge = `<script>${PREVIEW_BRIDGE}</script><style>html{overscroll-behavior:contain}</style>`;
   const styleTag = style ? `<style>${escapeClosingTag(style, 'style')}</style>` : '';
   const scriptTag = script
      ? `<script type="module">${escapeClosingTag(script, 'script')}</script>`
      : '';

   // 作者直接写了完整文档时按原文档注入，避免出现嵌套的 html 标签
   if (/<html[\s>]/i.test(markup)) {
      const head = `${bridge}${styleTag}`;
      const withHead = /<head[^>]*>/i.test(markup)
         ? markup.replace(/<head[^>]*>/i, (tag) => tag + head)
         : markup.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${head}</head>`);
      return /<\/body>/i.test(withHead)
         ? withHead.replace(/<\/body>/i, () => `${scriptTag}</body>`)
         : withHead + scriptTag;
   }

   return `<!doctype html><html lang="zh-CN"><head>${bridge}<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styleTag}</head><body>${markup}${scriptTag}</body></html>`;
};
