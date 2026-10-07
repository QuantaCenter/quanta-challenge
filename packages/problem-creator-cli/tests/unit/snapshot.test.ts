import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectSnapshot } from '../../src/domain/snapshot';
import { ensureDir } from '../../src/utils/fs';
import { createTempDir } from '../helpers/harness';

const PNG_1PX = Buffer.from(
   'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
   'base64',
);

describe('collectSnapshot', () => {
   it('键以挂载路径打头，文本按 utf8、二进制按 base64', async () => {
      const dir = await createTempDir();
      await ensureDir(join(dir, 'assets'));
      await writeFile(join(dir, 'index.html'), '<h1>hi</h1>', 'utf8');
      await writeFile(join(dir, 'assets/logo.png'), PNG_1PX);

      const snapshot = await collectSnapshot(dir);

      expect(Object.keys(snapshot.files).sort()).toEqual([
         '/project/assets/logo.png',
         '/project/index.html',
      ]);
      expect(snapshot.files['/project/index.html']).toBe('<h1>hi</h1>');
      // base64 往返必须无损：按 utf8 读会把图片写坏
      expect(
         Buffer.from(
            snapshot.files['/project/assets/logo.png'] ?? '',
            'base64',
         ),
      ).toEqual(PNG_1PX);
      expect(snapshot.fileCount).toBe(2);
      expect(snapshot.totalBytes).toBe(11 + PNG_1PX.byteLength);
   });

   it('支持自定义挂载路径并归一化斜杠', async () => {
      const dir = await createTempDir();
      await writeFile(join(dir, 'a.txt'), 'a', 'utf8');
      const snapshot = await collectSnapshot(dir, {
         mountPath: '/site//root/',
      });
      expect(Object.keys(snapshot.files)).toEqual(['/site/root/a.txt']);
   });

   it('跳过 node_modules / dist 等构建产物并记录被跳过的条目', async () => {
      const dir = await createTempDir();
      await ensureDir(join(dir, 'node_modules/pkg'));
      await ensureDir(join(dir, 'dist'));
      await writeFile(join(dir, 'node_modules/pkg/index.js'), 'x', 'utf8');
      await writeFile(join(dir, 'dist/bundle.js'), 'x', 'utf8');
      await writeFile(join(dir, 'main.js'), 'ok', 'utf8');

      const snapshot = await collectSnapshot(dir);

      expect(Object.keys(snapshot.files)).toEqual(['/project/main.js']);
      expect(snapshot.ignored).toEqual(['dist', 'node_modules']);
   });

   it('对不存在的目录返回空快照（由预检负责报"目录不存在"）', async () => {
      const snapshot = await collectSnapshot(
         join(await createTempDir(), 'nope'),
      );
      expect(snapshot.fileCount).toBe(0);
   });

   it('结果是稳定排序的，便于比较与统计', async () => {
      const dir = await createTempDir();
      await writeFile(join(dir, 'b.txt'), 'b', 'utf8');
      await writeFile(join(dir, 'a.txt'), 'a', 'utf8');
      const snapshot = await collectSnapshot(dir);
      expect(Object.keys(snapshot.files)).toEqual([
         '/project/a.txt',
         '/project/b.txt',
      ]);
   });
});
