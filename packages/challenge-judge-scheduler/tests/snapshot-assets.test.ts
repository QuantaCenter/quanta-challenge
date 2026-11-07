import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { encodeSnapshotBytes } from '@challenge/shared/snapshot-content';

const hash = (bytes: Uint8Array): string =>
   createHash('sha256').update(bytes).digest('hex');

test('判题文件恢复保留通用资源和历史图片的原始字节', async () => {
   const tempDir = await mkdtemp(join(tmpdir(), 'judge-assets-test-'));
   const previousTempDir = process.env.TEMP_DIR;
   process.env.TEMP_DIR = tempDir;
   try {
      const { TempFileService } = await import('../src/services/temp-file');
      const expected = new Map<string, Buffer>([
         ['/project/music.mp3', Buffer.concat([Buffer.from([0, 255]), randomBytes(1024)])],
         ['/project/font.woff2', Buffer.concat([Buffer.from([0, 1]), randomBytes(512)])],
         ['/project/module.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])],
         ['/project/payload.unknown', Buffer.from([1, 2, 3, 127])],
         ['/project/bom.txt', Buffer.from([0xef, 0xbb, 0xbf, 0x61])],
         ['/project/data.txt', Buffer.from('data:text/plain;base64,SGVsbG8=')],
         ['/project/empty.txt', Buffer.alloc(0)],
         ['/project/legacy.png', Buffer.from([0, 255, 10])],
         ['/project/double.png', Buffer.from([0, 255, 10])],
      ]);
      const snapshot = Object.fromEntries(
         [...expected].map(([path, bytes]) => [path, encodeSnapshotBytes(bytes)]),
      );
      snapshot['/project/legacy.png'] = 'AP8K';
      snapshot['/project/double.png'] = Buffer.from(
         'data:image/png;base64,AP8K',
      ).toString('base64');
      const service = TempFileService.instance;
      const { fsRootPath } = await service.restoreFileSystem(snapshot);
      try {
         for (const [path, bytes] of expected) {
            const restored = await readFile(join(fsRootPath, path));
            assert.equal(hash(restored), hash(bytes), path);
         }
      } finally {
         await service.cleanup(fsRootPath);
      }
   } finally {
      if (previousTempDir === undefined) delete process.env.TEMP_DIR;
      else process.env.TEMP_DIR = previousTempDir;
      await rm(tempDir, { recursive: true, force: true });
   }
});
