import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
   insertCodeBlock,
   insertHorizontalRule,
   insertLink,
   insertTable,
   toggleInlineWrap,
   toggleLinePrefix,
   type MarkdownEdit,
} from '../app/utils/markdown-format.ts';

/** 应用一次替换，返回新文本与选中的内容 */
const apply = (text: string, edit: MarkdownEdit) => {
   const next = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
   return { next, picked: next.slice(edit.selectFrom, edit.selectTo) };
};

test('加粗：选中文字被包裹，再次执行取消', () => {
   const text = 'hello world';
   const first = apply(text, toggleInlineWrap(text, 6, 11, '**', '粗体文本'));
   assert.equal(first.next, 'hello **world**');
   assert.equal(first.picked, 'world');

   const edit = toggleInlineWrap(first.next, 8, 13, '**', '粗体文本');
   assert.equal(apply(first.next, edit).next, 'hello world');
});

test('加粗：连同标记一起选中时也能取消', () => {
   const text = 'a **b** c';
   const edit = toggleInlineWrap(text, 2, 7, '**', '粗体文本');
   assert.equal(apply(text, edit).next, 'a b c');
});

test('无选区：插入占位并选中占位文字', () => {
   const result = apply('', toggleInlineWrap('', 0, 0, '**', '粗体文本'));
   assert.equal(result.next, '**粗体文本**');
   assert.equal(result.picked, '粗体文本');
});

test('选区两端的空白不会被包进标记', () => {
   const text = 'a  word  b';
   const result = apply(text, toggleInlineWrap(text, 1, 9, '**', 'x'));
   assert.equal(result.next, 'a  **word**  b');
});

test('斜体不会把粗体误判成已是斜体', () => {
   const text = '**word**';
   const result = apply(text, toggleInlineWrap(text, 2, 6, '*', '斜体文本'));
   assert.equal(result.next, '***word***');
});

test('标题：设置、切换级别、取消', () => {
   const text = 'title';
   const h1 = apply(text, toggleLinePrefix(text, 0, 0, 'h1'));
   assert.equal(h1.next, '# title');

   const h2 = apply(h1.next, toggleLinePrefix(h1.next, 0, 0, 'h2'));
   assert.equal(h2.next, '## title');

   const off = apply(h2.next, toggleLinePrefix(h2.next, 0, 0, 'h2'));
   assert.equal(off.next, 'title');
});

test('列表：多行统一加前缀，有序列表自动编号，空行跳过', () => {
   const text = 'a\n\nb\nc';
   const ul = apply(text, toggleLinePrefix(text, 0, text.length, 'ul'));
   assert.equal(ul.next, '- a\n\n- b\n- c');

   const ol = apply(ul.next, toggleLinePrefix(ul.next, 0, ul.next.length, 'ol'));
   assert.equal(ol.next, '1. a\n\n2. b\n3. c');

   const task = apply(ol.next, toggleLinePrefix(ol.next, 0, ol.next.length, 'task'));
   assert.equal(task.next, '- [ ] a\n\n- [ ] b\n- [ ] c');

   const off = apply(task.next, toggleLinePrefix(task.next, 0, task.next.length, 'task'));
   assert.equal(off.next, 'a\n\nb\nc');
});

test('列表：保留缩进；无序列表不会把任务列表当成已是无序列表', () => {
   const text = '  - [ ] todo';
   const result = apply(text, toggleLinePrefix(text, 0, 0, 'ul'));
   assert.equal(result.next, '  - todo');
});

test('行首前缀：选区结束在下一行行首时不包含那一行', () => {
   const text = 'a\nb';
   const result = apply(text, toggleLinePrefix(text, 0, 2, 'quote'));
   assert.equal(result.next, '> a\nb');
});

test('只作用于光标所在行', () => {
   const text = 'one\ntwo\nthree';
   const result = apply(text, toggleLinePrefix(text, 5, 5, 'quote'));
   assert.equal(result.next, 'one\n> two\nthree');
});

test('代码块：无选区时光标落在围栏内，有选区时包裹选区', () => {
   const edit = insertCodeBlock('intro', 5, 5);
   const empty = apply('intro', edit);
   assert.equal(empty.next, 'intro\n\n```\n\n```\n');
   // 光标位于两行围栏之间的空行
   assert.equal(edit.selectFrom, edit.selectTo);
   assert.equal(empty.next.slice(0, edit.selectFrom), 'intro\n\n```\n');

   const text = 'code here';
   const wrapped = apply(text, insertCodeBlock(text, 0, 4));
   assert.equal(wrapped.next, '```\ncode\n```\n\n here');
});

test('表格与分割线：前后补空行，表格选中第一个表头', () => {
   const table = apply('text', insertTable('text', 4, 4));
   assert.equal(table.picked, '列 1');
   assert.ok(table.next.startsWith('text\n\n| 列 1 |'));

   const hr = apply('a\n\nb', insertHorizontalRule('a\n\nb', 3, 3));
   assert.equal(hr.next, 'a\n\n---\n\nb');
});

test('链接：选中文字作文本，选中网址作目标，无选区给模板', () => {
   const withText = apply('docs', insertLink('docs', 0, 4));
   assert.equal(withText.next, '[docs](https://)');
   assert.equal(withText.picked, 'https://');

   const withUrl = apply('https://a.com', insertLink('https://a.com', 0, 13));
   assert.equal(withUrl.next, '[链接文本](https://a.com)');
   assert.equal(withUrl.picked, '链接文本');

   const empty = apply('', insertLink('', 0, 0));
   assert.equal(empty.next, '[链接文本](https://)');
   assert.equal(empty.picked, '链接文本');
});
