import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeSnapshotContent } from '@challenge/shared/snapshot-content';
import { walkFileList } from '../app/components/st/DropUploader/walk-file-list';
import { convertToFsTree } from '../app/pages/challenge/_composables/use-web-container/convert-to-fs-tree';
import { convertToPathContentMap } from '../app/pages/challenge/_composables/use-web-container/convert-to-path-content-map';
import {
   snapshotBinaryBytes,
   snapshotDownloadUrl,
   snapshotImageUrl,
} from '../app/utils/snapshot-preview';

test('上传和 WebContainer 快照保留未知二进制、图片与文本字节', async () => {
   const samples: Record<string, Uint8Array> = {
      'track.mp3': Uint8Array.of(0xff, 0xfb, 0, 0x80),
      'unknown': Uint8Array.of(0, 0xff, 1, 2),
      'logo.png': Uint8Array.of(
         0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
      ),
      'looks.png': new TextEncoder().encode('test'),
      'code.js': new TextEncoder().encode('const x = 1;\n'),
   };
   const files = Object.entries(samples).map(([name, bytes]) => ({
      name,
      webkitRelativePath: `project/${name}`,
      arrayBuffer: async () => bytes.buffer,
   })) as unknown as FileList;
   const uploaded = await walkFileList(files);
   const project = uploaded.project as Record<string, string>;
   const map = Object.fromEntries(
      Object.entries(project).map(([name, content]) => [`/project/${name}`, content])
   );
   const repacked = convertToPathContentMap(convertToFsTree(map));
   for (const [name, original] of Object.entries(samples)) {
      const content = repacked[`/project/${name}`]!;
      const decoded = decodeSnapshotContent(name, content);
      const bytes = typeof decoded === 'string'
         ? new TextEncoder().encode(decoded)
         : decoded;
      assert.deepEqual(bytes, original, name);
   }
   assert.ok(snapshotBinaryBytes('/project/track.mp3', project['track.mp3']));
   assert.ok(snapshotDownloadUrl('/project/track.mp3', project['track.mp3']));
   assert.equal(
      snapshotImageUrl('/project/track.mp3', project['track.mp3']), undefined
   );
   assert.match(
      snapshotImageUrl('/project/logo.png', project['logo.png'])!, /^data:image\/png;/
   );
   assert.equal(
      snapshotImageUrl('/project/looks.png', project['looks.png']), undefined
   );
});

test('旧图片裸 base64 仍可预览', () => {
   const content = 'iVBORw0KGgo=';
   assert.match(snapshotImageUrl('/logo.png', content)!, /^data:image\/png;/);
});
