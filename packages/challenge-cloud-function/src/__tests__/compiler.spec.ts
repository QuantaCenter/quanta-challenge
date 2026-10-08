import { describe, expect, it } from 'vitest';
import { compileFunction } from '../services/compiler';

describe('云函数编译器', () => {
   it('编译合法 TS 单文件函数', async () => {
      const result = await compileFunction(
         `export default async function (ctx: { input: unknown }) { return ctx.input; }`,
         'demo',
      );
      expect(result.code).toContain('module.exports');
      expect(result.bytes).toBeGreaterThan(0);
   });

   it('拒绝 node 内置模块（被实际引用时）', async () => {
      await expect(
         compileFunction(
            `import fs from 'node:fs';\nexport default () => typeof fs.readFileSync;`,
            'demo',
         ),
      ).rejects.toMatchObject({ code: 'COMPILE_ERROR' });
   });

   it('拒绝裸副作用导入', async () => {
      await expect(
         compileFunction(`import 'node:fs';\nexport default () => 1;`, 'demo'),
      ).rejects.toMatchObject({ code: 'COMPILE_ERROR' });
   });

   it('拒绝 npm 包', async () => {
      await expect(
         compileFunction(
            `import { Hono } from 'hono';\nexport default () => typeof Hono;`,
            'demo',
         ),
      ).rejects.toMatchObject({ code: 'COMPILE_ERROR' });
   });

   it('语法错误被包装成 COMPILE_ERROR', async () => {
      await expect(
         compileFunction(`export default function ( {`, 'demo'),
      ).rejects.toMatchObject({ code: 'COMPILE_ERROR' });
   });
});
