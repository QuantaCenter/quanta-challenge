import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { resolveMinimumCliVersion } from '@challenge/shared/cli-version';
import {
   decodeSnapshotContent,
   encodeSnapshotBytes,
   parseSnapshotBase64DataUrl,
} from '@challenge/shared/snapshot-content';

import { collectSnapshot } from '../src/domain/snapshot';

const bytesOf = (value: string | Uint8Array): Uint8Array =>
   typeof value === 'string' ? new TextEncoder().encode(value) : value;

test('快照编码无损保留文本、二进制和字面 data URL', () => {
   for (const bytes of [
      Buffer.from('中文🙂\t\r\n'),
      Buffer.from([0xef, 0xbb, 0xbf, 0x61]),
      Buffer.from('data:text/plain;base64,SGVsbG8='),
      Buffer.from([0, 1, 0xff, 0x80]),
      Buffer.alloc(0),
   ]) {
      const decoded = decodeSnapshotContent(
         '/project/file.bin',
         encodeSnapshotBytes(bytes),
      );
      assert.deepEqual(Buffer.from(bytesOf(decoded)), bytes);
   }
   for (const bytes of [Buffer.from([1, 2, 3]), Buffer.from([127])]) {
      assert.ok(encodeSnapshotBytes(bytes).startsWith('data:'));
   }
});

test('严格 data URL 校验与历史图片兼容', () => {
   assert.deepEqual(
      parseSnapshotBase64DataUrl('data:application/octet-stream;base64,'),
      new Uint8Array(),
   );
   for (const value of [
      'data:x;base64,A',
      'data:x;base64,AB==',
      'data:x;base64,AA===',
      'data:x;base64,AA==\n',
   ]) {
      assert.equal(parseSnapshotBase64DataUrl(value), undefined);
   }
   const inner = 'data:image/png;base64,AP8=';
   const bare = decodeSnapshotContent('a.png', 'AP8=');
   const double = decodeSnapshotContent(
      'a.png',
      Buffer.from(inner).toString('base64'),
   );
   assert.deepEqual(Buffer.from(bytesOf(bare)), Buffer.from([0, 255]));
   assert.deepEqual(Buffer.from(bytesOf(double)), Buffer.from([0, 255]));
});

test('部署配置不能降低 CLI 最低版本', () => {
   for (const value of [
      undefined,
      '',
      '1.2.0',
      '1.2.3-beta.1',
      '1.9.0-invalid!',
   ]) {
      assert.equal(resolveMinimumCliVersion(value), '1.2.3');
   }
   assert.equal(resolveMinimumCliVersion('1.3.0'), '1.3.0');
});

test('采集未知扩展名、文本和旧图片 data URL', async () => {
   const dir = await mkdtemp(join(tmpdir(), 'qpc-snapshot-'));
   try {
      const fixtures = new Map([
         ['sound.unknown', Buffer.from([0, 255, 1])],
         ['source.txt', Buffer.from('data:text/plain;base64,SGVsbG8=')],
         ['plain.png', Buffer.from('hello')],
         ['empty.png', Buffer.alloc(0)],
         ['legacy.png', Buffer.from('data:image/png;base64,AP8=')],
      ]);
      for (const [name, bytes] of fixtures)
         await writeFile(join(dir, name), bytes);
      const result = await collectSnapshot(dir);
      for (const [name, bytes] of fixtures) {
         const expected = name === 'legacy.png' ? Buffer.from([0, 255]) : bytes;
         const content = result.files[`/project/${name}`];
         assert.notEqual(content, undefined);
         assert.deepEqual(
            Buffer.from(bytesOf(decodeSnapshotContent(name, content!))),
            expected,
         );
      }
      assert.deepEqual(result.decodedDataUrls, ['legacy.png']);
   } finally {
      await rm(dir, { recursive: true, force: true });
   }
});
