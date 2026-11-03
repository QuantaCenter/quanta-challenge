import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Marked } from 'marked';
import {
   buildPlaygroundDocument,
   createPlaygroundExtension,
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

test('桥接脚本：console 参数按 Node 风格格式化后回传', () => {
   const doc = buildPlaygroundDocument([
      { name: 'script.js', language: 'javascript', code: '' },
   ]);
   const bridge = doc.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
   const sent: { level: string; text: string }[] = [];
   const fakeConsole: Record<string, () => void> = {
      log: () => {},
      warn: () => {},
   };
   const listener = { addEventListener: () => {} };
   new Function('parent', 'window', 'document', 'console', bridge)(
      { postMessage: (data: { level: string; text: string }) => sent.push(data) },
      listener,
      listener,
      fakeConsole,
   );

   const circular: Record<string, unknown> = { id: 1 };
   circular.self = circular;
   fakeConsole.log!.call(null, 'var:', [3, 3, 3], { name: 'Ada', tags: ['a'] });
   fakeConsole.warn!.call(null, circular, new Map([['k', 1]]));

   assert.deepEqual(sent, [
      { source: 'st-playground-preview', level: 'log', text: "var: [ 3, 3, 3 ] { name: 'Ada', tags: [ 'a' ] }" },
      { source: 'st-playground-preview', level: 'warn', text: "{ id: 1, self: [Circular] } Map(1) { 'k' => 1 }" },
   ]);
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
