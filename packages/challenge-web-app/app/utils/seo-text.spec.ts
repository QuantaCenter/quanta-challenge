import { describe, expect, test } from 'vitest';
import { toSeoText } from './seo-text';

describe('toSeoText', () => {
   test('行内代码去掉尖括号但保留文字', () => {
      expect(toSeoText('只需补全 `<style>` 里的样式。')).toBe(
         '只需补全 style 里的样式。'
      );
      expect(toSeoText('用 `border-radius: 8px` 圆角')).toBe(
         '用 border-radius: 8px 圆角'
      );
   });

   test('强调记号去壳', () => {
      expect(toSeoText('**不要**改结构，*只*补样式')).toBe('不要改结构，只补样式');
      expect(toSeoText('字段名 user_name 不要腰斩')).toBe(
         '字段名 user_name 不要腰斩'
      );
   });

   test('剥掉不在代码里的裸标签', () => {
      expect(toSeoText('把 <script>alert(1)</script> 删掉')).toBe(
         '把 alert(1) 删掉'
      );
   });

   test('围栏代码块整段丢弃', () => {
      const md = ['说明：', '```css', 'body { margin: 0 }', '```', '结束'].join(
         '\n'
      );
      expect(toSeoText(md)).toBe('说明： 结束');
   });

   test('链接保留文字、图片丢弃', () => {
      expect(toSeoText('见 [文档](https://a.b/c) 与 ![图](https://a.b/d.png)')).toBe(
         '见 文档 与'
      );
   });

   test('markdown 记号、列表前缀与换行被压成单行', () => {
      const md = '## 标题\n\n- 第一项\n- 第二项\n\n> 引用';
      expect(toSeoText(md)).toBe('标题 第一项 第二项 引用');
   });

   test('不误伤正文里的比较号、连字符与加号', () => {
      expect(toSeoText('当 a < b 且 c > d 时')).toBe('当 a < b 且 c > d 时');
      expect(toSeoText('C++ / Web-Container')).toBe('C++ / Web-Container');
   });

   test('残缺的标签写法：至少打掉那个 `<`，不让正则再命中', () => {
      expect(toSeoText('只写了 <style 没闭合')).toBe('只写了 style 没闭合');
      expect(toSeoText('还有 <SCRIPT/x')).toBe('还有 SCRIPT/x');
   });

   test('对抗样本：大小写、残缺、带属性的标签一律中和', () => {
      const nasty = [
         '<style>',
         '<STYLE>',
         '<ScRiPt>alert(1)</script>',
         '<link rel="stylesheet" href="x">',
         '<img src=x onerror=y>',
         '只写了 <style 没闭合',
      ].join(' ');

      expect(toSeoText(nasty)).not.toMatch(/<[a-zA-Z/]/);
   });

   test('空输入返回空串', () => {
      expect(toSeoText()).toBe('');
      expect(toSeoText(null)).toBe('');
      expect(toSeoText('')).toBe('');
   });

   test('真实题面切片后不含裸标签（回归：nonce 注入 + head 文本泄漏）', () => {
      const detail = [
         '## 题目要求',
         '',
         '用 CSS 完成一张「个人名片卡片」的盒模型与视觉样式。',
         'HTML 结构已经给出，**不要改动任何标签结构**，只需补全 `<style>` 里的样式。',
         '',
         '判分关注的行为：',
         '',
         '- 卡片居中显示',
      ].join('\n');

      const description = toSeoText(detail).slice(0, 100);

      // 关键不变式：不再有任何 HTML 解析器会认作标签起始的 `<`，
      // nuxt-security 的 /<style|<script|<link/ 正则就再也无从下手
      expect(description).not.toMatch(/<[a-zA-Z/]/);
      expect(description).not.toContain('`');
      expect(description).not.toContain('\n');
      expect(description.startsWith('题目要求')).toBe(true);
      expect(description).toContain('style');
   });
});
