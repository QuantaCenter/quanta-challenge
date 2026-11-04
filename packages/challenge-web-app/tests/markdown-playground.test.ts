import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Marked } from 'marked';
import {
   buildPlaygroundDocument,
   createPlaygroundExtension,
   createPreviewLeaveGuard,
   parsePlayground,
   splitMarkdownBlocks,
   type IPlaygroundSpec,
} from '../app/utils/markdown-playground.ts';

const fence = (lang: string, code: string) => `\`\`\`${lang}\n${code}\n\`\`\``;

/** 用与 useMarkdown 相同的方式解析，返回块序列与收集到的演练 */
const render = async (source: string) => {
   const specs: IPlaygroundSpec[] = [];
   const parser = new Marked();
   parser.use({ extensions: [createPlaygroundExtension(specs)] });
   const html = await parser.parse(source, { gfm: true, breaks: true });
   return { specs, blocks: splitMarkdownBlocks(html, specs) };
};

test('正文与演练块交替切片，普通代码块与紧贴的段落不受影响', async () => {
   const source = [
      '# 标题',
      '',
      '<Playground title="flex">',
      fence('html', '<div class="row"></div>'),
      fence('css', '.row { display: flex; }'),
      '</Playground>',
      '紧贴的段落',
      '',
      fence('js', '// 普通代码块'),
   ].join('\n');
   const { specs, blocks } = await render(source);
   assert.deepEqual(
      blocks.map((block) => block.kind),
      ['html', 'playground', 'html'],
   );
   assert.equal(specs.length, 1);
   const tail = blocks[2];
   assert.ok(tail?.kind === 'html' && tail.html.includes('紧贴的段落'));
   assert.ok(tail?.kind === 'html' && tail.html.includes('普通代码块'));
});

test('属性：数字高度补 px，布局与控制台开关', () => {
   const spec = parsePlayground(
      ' title="演示" height="320" layout="horizontal" console="true"',
      fence('js', 'console.log(1)'),
   );
   assert.equal(spec.title, '演示');
   assert.equal(spec.height, '320px');
   assert.equal(spec.layout, 'horizontal');
   assert.equal(spec.console, 'show');

   const fallback = parsePlayground('', fence('js', 'x'));
   assert.equal(fallback.layout, 'horizontal');
   assert.equal(parsePlayground(' layout="vertical"', fence('js', 'x')).layout, 'vertical');
   assert.equal(fallback.console, 'auto');
   assert.equal(parsePlayground(' console="false"', fence('js', 'x')).console, 'hide');
});

test('预览：纯脚本默认关闭，有标记或样式时默认开启，可显式覆盖', () => {
   const script = parsePlayground('', fence('js', 'x'));
   assert.equal(script.preview, false);
   assert.equal(script.height, '9rem');

   const markup = parsePlayground('', fence('css', 'p{}'));
   assert.equal(markup.preview, true);
   assert.equal(markup.height, '16rem');

   assert.equal(parsePlayground(' preview="true"', fence('js', 'x')).preview, true);
   assert.equal(parsePlayground(' preview="false"', fence('html', '<p></p>')).preview, false);
});

test('文件：按 html/css/js 排序，同语言合并，未知语言忽略', () => {
   const body = [
      fence('js', 'a()'),
      fence('ts', 'ignored'),
      fence('html', '<p></p>'),
      fence('javascript', 'b()'),
   ].join('\n');
   const { files } = parsePlayground('', body);
   assert.deepEqual(
      files.map((file) => [file.name, file.code]),
      [
         ['index.html', '<p></p>'],
         ['script.js', 'a()\n\nb()'],
      ],
   );
});

test('没有围栏时整段按 HTML；空块不渲染', async () => {
   const bare = parsePlayground('', '   <p>直接写</p>');
   assert.deepEqual(bare.files, [
      { name: 'index.html', language: 'html', code: '<p>直接写</p>' },
   ]);

   const { specs, blocks } = await render('<Playground>\n</Playground>\n');
   assert.equal(specs.length, 0);
   assert.equal(blocks.length, 0);
});

test('签名随内容变化', () => {
   const a = parsePlayground('', fence('js', 'a'));
   const b = parsePlayground('', fence('js', 'b'));
   assert.notEqual(a.signature, b.signature);
   assert.equal(a.signature, parsePlayground('', fence('js', 'a')).signature);
});

test('预览文档：片段模式拼出完整文档，并转义闭合标签', () => {
   const doc = buildPlaygroundDocument([
      { name: 'index.html', language: 'html', code: '<p>hi</p>' },
      { name: 'style.css', language: 'css', code: 'p{color:red}' },
      {
         name: 'script.js',
         language: 'javascript',
         code: "console.log('</script>')",
      },
   ]);
   assert.ok(doc.startsWith('<!doctype html>'));
   assert.ok(doc.includes('<style>p{color:red}</style></head>'));
   assert.ok(
      doc.includes(
         "<body><p>hi</p><script type=\"module\">console.log('<\\/script>')</script></body>",
      ),
   );
});

type TAttrs = Record<string, string>;
type THandler = (event: unknown) => void;

const SITE_BASE = 'https://site.test/learning/study/1';

/** 在桩环境里执行桥接脚本，记录发往宿主的消息与事件处理器 */
const loadBridge = (frameName = '') => {
   const doc = buildPlaygroundDocument([
      { name: 'script.js', language: 'javascript', code: '' },
   ]);
   const bridge = doc.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
   const handlers: Record<string, THandler> = {};
   const sent: Record<string, unknown>[] = [];
   const replaced: string[] = [];
   const fakeConsole: Record<string, (...args: unknown[]) => void> = {
      log: () => {},
      warn: () => {},
   };
   new Function('parent', 'window', 'document', 'console', 'location', bridge)(
      { postMessage: (data: Record<string, unknown>) => sent.push(data) },
      {
         name: frameName,
         addEventListener: (type: string, fn: THandler) => {
            handlers[type] = fn;
         },
      },
      { baseURI: SITE_BASE, addEventListener: () => {} },
      fakeConsole,
      { href: 'about:srcdoc#old', replace: (url: string) => replaced.push(url) },
   );

   const element = (attrs: TAttrs) => ({
      getAttribute: (name: string) => attrs[name] ?? null,
      hasAttribute: (name: string) => name in attrs,
   });
   const dispatch = (type: string, event: Record<string, unknown>) => {
      const record = {
         defaultPrevented: false,
         prevented: false,
         preventDefault() {
            this.prevented = true;
         },
         ...event,
      };
      handlers[type]!(record);
      return record.prevented;
   };

   return {
      sent,
      replaced,
      console: fakeConsole,
      warnings: () =>
         sent.filter((m) => m.level === 'warn').map((m) => String(m.text)),
      click: (attrs: TAttrs | null, init: Record<string, unknown> = {}) =>
         dispatch('click', {
            button: 0,
            target: { closest: () => (attrs ? element(attrs) : null) },
            ...init,
         }),
      submit: (
         form: TAttrs,
         submitter: TAttrs | null = null,
         init: Record<string, unknown> = {},
      ) =>
         dispatch('submit', {
            target: element(form),
            submitter: submitter ? element(submitter) : null,
            ...init,
         }),
      pagehide: () => handlers.pagehide!({}),
   };
};

test('桥接脚本：console 参数按 Node 风格格式化后回传', () => {
   const bridge = loadBridge();
   const circular: Record<string, unknown> = { id: 1 };
   circular.self = circular;
   bridge.console.log!('var:', [3, 3, 3], { name: 'Ada', tags: ['a'] });
   bridge.console.warn!(circular, new Map([['k', 1]]));

   assert.deepEqual(
      bridge.sent.filter((message) => !message.type),
      [
         { source: 'st-playground-preview', level: 'log', text: "var: [ 3, 3, 3 ] { name: 'Ada', tags: [ 'a' ] }" },
         { source: 'st-playground-preview', level: 'warn', text: "{ id: 1, self: [Circular] } Map(1) { 'k' => 1 }" },
      ],
   );
});

test('桥接脚本：启动时上报 ready，卸载时带 iframe name 上报 leave', () => {
   const bridge = loadBridge('pg-1');
   assert.deepEqual(bridge.sent[0], { source: 'st-playground-preview', type: 'ready' });

   bridge.pagehide();
   assert.deepEqual(bridge.sent.at(-1), {
      source: 'st-playground-preview',
      type: 'leave',
      allowed: false,
      frame: 'pg-1',
   });
});

test('桥接脚本：页内锚点在 iframe 自身地址上替换片段', () => {
   const bridge = loadBridge();
   assert.equal(bridge.click({ href: ' #section ' }), true);
   assert.equal(bridge.click({ href: '#', target: '_self' }), true);
   assert.deepEqual(bridge.replaced, ['about:srcdoc#section', 'about:srcdoc#']);

   assert.equal(bridge.click({ href: '#x', target: '_blank' }), false);
   assert.equal(bridge.click({ href: '#x' }, { metaKey: true }), false);
   assert.equal(bridge.click({ href: '#x' }, { button: 1 }), false);
   assert.equal(bridge.click({ href: '#x' }, { defaultPrevented: true }), false);
   assert.equal(bridge.click(null), false);
   assert.equal(bridge.replaced.length, 2);
   assert.deepEqual(bridge.warnings(), []);
});

test('桥接脚本：站内链接被拦截并提示，站外链接放行并在离开时标记', () => {
   const bridge = loadBridge();
   for (const href of ['/foo', '', '?q=1', 'other', 'https://site.test/app']) {
      assert.equal(bridge.click({ href }), true, href);
   }
   assert.equal(bridge.warnings().length, 5);
   assert.match(bridge.warnings()[0]!, /已拦截跳转：\/foo/);
   assert.match(bridge.warnings()[1]!, /已拦截跳转：（空地址）/);

   for (const attrs of [
      { href: '/foo', target: '_blank' },
      { href: '/foo', download: '' },
      { href: 'javascript:void 0' },
      { href: 'mailto:a@b.c' },
   ]) {
      assert.equal(bridge.click(attrs), false, JSON.stringify(attrs));
   }
   bridge.pagehide();
   assert.equal(bridge.sent.at(-1)?.allowed, false);

   assert.equal(bridge.click({ href: 'https://example.com/' }), false);
   bridge.pagehide();
   assert.equal(bridge.sent.at(-1)?.allowed, true);
   bridge.pagehide();
   assert.equal(bridge.sent.at(-1)?.allowed, false);
   assert.equal(bridge.warnings().length, 5);
});

test('桥接脚本：表单提交到站内地址被拦截，其余放行', () => {
   const bridge = loadBridge();
   assert.equal(bridge.submit({ action: '/foo' }), true);
   assert.equal(bridge.submit({}, { formaction: '/foo' }), true);
   assert.equal(bridge.submit({ action: '#' }), true);
   assert.match(bridge.warnings()[0]!, /已拦截表单提交：\/foo/);

   // 无 action 时提交到 about:srcdoc 本身，属于重新载入演练
   assert.equal(bridge.submit({}), false);
   assert.equal(bridge.submit({ action: '  ' }), false);
   assert.equal(bridge.submit({ action: '/foo' }, { formaction: '' }), false);
   assert.equal(bridge.submit({ action: '/foo', method: 'DIALOG' }), false);
   assert.equal(bridge.submit({ action: '/foo' }, { formmethod: 'dialog' }), false);
   assert.equal(bridge.submit({ action: '/foo', target: '_blank' }), false);
   assert.equal(bridge.submit({ action: '/foo' }, { formtarget: '_blank' }), false);
   assert.equal(bridge.submit({ action: '/foo' }, null, { defaultPrevented: true }), false);
   assert.equal(bridge.warnings().length, 3);

   assert.equal(bridge.submit({ action: 'https://example.com/form' }), false);
   bridge.pagehide();
   assert.equal(bridge.sent.at(-1)?.allowed, true);
});

test('离开守卫：等不到新的演练文档时恢复，重新载入与站外放行不受影响', (t) => {
   t.mock.timers.enable({ apis: ['setTimeout'] });
   let escapes = 0;
   const guard = createPreviewLeaveGuard(() => {
      escapes += 1;
   });

   // 重新载入演练文档：ready 先到或在 load 后宽限期内到达
   guard.leave();
   guard.ready();
   guard.load();
   guard.leave();
   guard.load();
   t.mock.timers.tick(299);
   guard.ready();
   t.mock.timers.tick(5000);
   assert.equal(escapes, 0);

   // 跳到别的页面：load 后宽限期内没有 ready
   guard.leave();
   guard.load();
   t.mock.timers.tick(300);
   assert.equal(escapes, 1);
   guard.load();
   t.mock.timers.tick(5000);
   assert.equal(escapes, 1);

   // 卸载后一直没有 load（如 Firefox 打不开 about:srcdoc?query）
   guard.leave();
   t.mock.timers.tick(1499);
   assert.equal(escapes, 1);
   t.mock.timers.tick(1);
   assert.equal(escapes, 2);

   // 站外放行、单独的 load、重新运行都不触发
   guard.leave(true);
   guard.load();
   guard.load();
   t.mock.timers.tick(5000);
   guard.leave();
   guard.reset();
   t.mock.timers.tick(5000);
   assert.equal(escapes, 2);
});

test('预览文档：作者写了完整文档时注入而不嵌套', () => {
   const doc = buildPlaygroundDocument([
      {
         name: 'index.html',
         language: 'html',
         code: '<!doctype html><html><head><title>t</title></head><body><p>x</p></body></html>',
      },
      { name: 'style.css', language: 'css', code: 'p{}' },
      { name: 'script.js', language: 'javascript', code: 'run()' },
   ]);
   assert.equal(doc.match(/<html/g)?.length, 1);
   assert.ok(doc.includes('<style>p{}</style><title>t</title>'));
   assert.ok(doc.includes('<p>x</p><script type="module">run()</script></body>'));
});
