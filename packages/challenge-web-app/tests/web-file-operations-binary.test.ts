import assert from 'node:assert/strict';
import test from 'node:test';
import type { WebContainer } from '@webcontainer/api';
import { decodeSnapshotContent } from '@challenge/shared/snapshot-content';
import { FileSystemDispatcher } from '../app/pages/challenge/_composables/use-commands/file-system-dispatcher';
import { FileSystemOperator } from '../app/pages/challenge/_composables/use-commands/file-system-operator';
import { moveSnapshotFiles } from '../app/utils/snapshot-file';
import * as pathUtils from '../app/utils/path-utils';

Object.assign(globalThis, pathUtils);

const toBytes = (path: string, content: string) => {
   const decoded = decodeSnapshotContent(path, content);
   return typeof decoded === 'string'
      ? new TextEncoder().encode(decoded)
      : decoded;
};

const createContainer = () => {
   const files = new Map<string, Uint8Array>();
   const directories = new Set(['project', 'project/source', 'project/target']);
   let watcher: ((event: string, path: string) => void) | undefined;
   const fs = {
      watch: (_path: string, _options: unknown, callback: typeof watcher) => {
         watcher = callback;
      },
      readFile: async (path: string, encoding?: string) => {
         assert.equal(encoding, undefined, '二进制文件必须按字节读取');
         const value = files.get(path);
         if (!value) throw new Error('not found');
         return value.slice();
      },
      writeFile: async (path: string, bytes: Uint8Array) => {
         assert.ok(bytes instanceof Uint8Array);
         files.set(path, bytes.slice());
      },
      readdir: async (path: string, options?: { withFileTypes: boolean }) => {
         if (!directories.has(path)) throw new Error('not a directory');
         if (!options?.withFileTypes) return [];
         const prefix = `${path}/`;
         return [
            ...Array.from(directories).filter((item) => item.startsWith(prefix)),
            ...Array.from(files.keys()).filter((item) => item.startsWith(prefix)),
         ]
            .filter((item) => !item.slice(prefix.length).includes('/'))
            .map((item) => ({
               name: item.slice(prefix.length),
               isDirectory: () => directories.has(item),
            }));
      },
      mkdir: async (path: string) => {
         directories.add(path);
      },
      rename: async (from: string, to: string) => {
         const bytes = files.get(from);
         if (!bytes) throw new Error('not found');
         files.set(to, bytes);
         files.delete(from);
      },
   };
   return {
      files,
      container: { fs } as unknown as WebContainer,
      notify: (event: string, path: string) => watcher?.(event, path),
   };
};

test('终端创建和修改音频均产生无损同步变更', async () => {
   const mock = createContainer();
   const tree = { value: [{
      name: 'project', path: '/project', type: 'folder' as const, children: [],
   }] };
   const batches: Array<Array<{ type: string; path?: string; content?: string }>> = [];
   const dispatcher = new FileSystemDispatcher(
      async () => mock.container,
      tree,
      new Set(),
      (changes) => batches.push(changes)
   );
   await dispatcher.startListening();
   const flush = async () => {
      const internal = dispatcher as unknown as { _dispatchChanges(): Promise<void> };
      await internal._dispatchChanges();
   };

   const first = Uint8Array.of(0xff, 0xfb, 0, 0x81);
   mock.files.set('project/audio.mp3', first);
   mock.notify('rename', 'project/audio.mp3');
   await flush();
   assert.equal(batches[0]?.[0]?.type, 'create');
   assert.deepEqual(
      toBytes('/project/audio.mp3', batches[0]![0]!.content!), first
   );

   const second = Uint8Array.of(0xff, 0xfb, 1, 0x99);
   mock.files.set('project/audio.mp3', second);
   mock.notify('change', 'project/audio.mp3');
   await flush();
   assert.equal(batches[1]?.[0]?.type, 'change');
   assert.deepEqual(
      toBytes('/project/audio.mp3', batches[1]![0]!.content!), second
   );
   dispatcher.stopListening();
});

test('复制文件和目录并重命名图片时保留原始字节', async () => {
   const mock = createContainer();
   const bytes = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0, 0xff);
   mock.files.set('project/source/logo.png', bytes);
   const tree = { value: [{
      name: 'project', path: '/project', type: 'folder' as const,
      children: [
         { name: 'source', path: '/project/source', type: 'folder' as const, children: [] },
         { name: 'target', path: '/project/target', type: 'folder' as const, children: [] },
      ],
   }] };
   const messages = {
      success() {},
      warning() {},
      error: (...args: unknown[]) => { throw new Error(String(args)); },
   };
   const operator = new FileSystemOperator(async () => mock.container, tree, messages as never);
   await operator.pasteItem('/project/target', 'folder', {
      type: 'file', path: '/project/source/logo.png', isCut: false,
   });
   assert.deepEqual(mock.files.get('project/target/logo.png'), bytes);
   await operator.pasteItem('/project/target', 'folder', {
      type: 'folder', path: '/project/source', isCut: false,
   });
   assert.deepEqual(mock.files.get('project/target/source/logo.png'), bytes);

   Object.assign(globalThis, {
      dialog: { prompt: async () => 'renamed.bin' },
      useEventBus: () => ({ emit() {} }),
   });
   await operator.renameItem('/project/target/logo.png', 'logo.png');
   assert.deepEqual(mock.files.get('project/target/renamed.bin'), bytes);

   const snapshots = { '/project/logo.png': { content: btoa(String.fromCharCode(...bytes)) } };
   moveSnapshotFiles(snapshots, '/project/logo.png', '/project/renamed.bin');
   assert.deepEqual(
      toBytes('/project/renamed.bin', snapshots['/project/renamed.bin']!.content),
      bytes
   );
});
