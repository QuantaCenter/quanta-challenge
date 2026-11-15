import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { readonly, ref } from 'vue';
import { minimatch } from 'minimatch';
import { takeFileSyncBatch, type FileSyncChange } from '../shared/file-sync.ts';
import { normalizePath } from '../app/utils/path-utils.ts';

const source = await readFile(new URL('../app/pages/challenge/_subpages/editor/_composables/use-file-change-sync.ts', import.meta.url), 'utf8');
const script = ts.transpileModule(source.replace(/^import .*;\n/gm, ''), {
   compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const createSync = (
   send: (changes: FileSyncChange[], revision?: number) => Promise<{ processedCount: number }>,
   maxChanges = 50,
   getRevision = () => 1,
) => {
   const errors: string[] = [];
   const factory = new Function(
      'exports', 'ref', 'readonly', 'minimatch', 'normalizePath', 'takeFileSyncBatch',
      'useNuxtApp', 'useRuntimeConfig', 'useMessage', 'atLeastTime',
      'onMounted', 'onUnmounted', 'setTimeout', 'clearTimeout', 'DEFAULT_FILE_SYSTEM_SYNC_INTERVAL',
      `${script}\nreturn exports.useFileChangeSync;`,
   );
   const useSync = factory({}, ref, readonly, minimatch, normalizePath, takeFileSyncBatch,
      () => ({}), () => ({ public: { fileSync: { maxChangesPerSync: maxChanges } } }),
      () => ({ error: (message: string) => errors.push(message) }),
      (_duration: number, promise: Promise<unknown>) => promise,
      () => {}, () => {}, () => 1, () => {}, 5000);
   return { sync: useSync({ send, getRevision }), errors };
};

test('batches respect UTF-8 JSON bytes, escapes, operation limits and original order', () => {
   const changes: FileSyncChange[] = Array.from({ length: 120 }, (_, index) => ({
      type: 'change', path: `/project/${index}.txt`, content: '中文"\\\n'.repeat(500),
   }));
   const pending = [...changes];
   const sent: FileSyncChange[] = [];
   while (pending.length) {
      const batch = takeFileSyncBatch(pending, 10, 30_000);
      assert.ok(batch.length > 0 && batch.length <= 10);
      assert.ok(Buffer.byteLength(JSON.stringify({ changes: batch })) < 30_000);
      sent.push(...batch);
      pending.splice(0, batch.length);
   }
   assert.deepEqual(sent, changes);
   const large: FileSyncChange = { type: 'change', path: '/project/large.txt', content: 'x'.repeat(2 * 1024 * 1024) };
   assert.deepEqual(takeFileSyncBatch([large, changes[0]!]), [large]);
});

test('sync sends more than fifty operations sequentially with a fixed project revision', async () => {
   let revision = 7;
   const batches: FileSyncChange[][] = [];
   const revisions: (number | undefined)[] = [];
   const { sync } = createSync(async (changes, currentRevision) => {
      batches.push(changes);
      revisions.push(currentRevision);
      revision++;
      return { processedCount: changes.length };
   }, 50, () => revision);
   for (let index = 0; index < 120; index++) sync.change(`/project/${index}.txt`, 'content');
   await sync.forceSync();
   assert.deepEqual(batches.map(batch => batch.length), [50, 50, 20]);
   assert.deepEqual(revisions, [7, 7, 7]);
   assert.equal(sync.syncStatus.value, 'success');
});

test('retry preserves failed and unattempted operations without replaying committed batches', async () => {
   const sent: string[][] = [];
   let fail = true;
   const { sync } = createSync(async changes => {
      sent.push(changes.map(change => 'path' in change ? change.path : change.newPath));
      if (sent.length === 2 && fail) throw new Error('Network failure');
      return { processedCount: changes.length };
   }, 2);
   for (let index = 0; index < 5; index++) sync.change(`/project/${index}`, 'content');
   await sync.forceSync();
   assert.equal(sync.syncStatus.value, 'error');
   fail = false;
   await sync.forceSync();
   assert.deepEqual(sent, [
      ['/project/0', '/project/1'], ['/project/2', '/project/3'],
      ['/project/2', '/project/3'], ['/project/4'],
   ]);
});

test('a rejected batch does not discard later unsent changes', async () => {
   const sent: string[][] = [];
   const { sync } = createSync(async changes => {
      sent.push(changes.map(change => 'path' in change ? change.path : change.newPath));
      if (sent.length === 1) throw { data: { code: 'PAYLOAD_TOO_LARGE' }, message: 'Quota exceeded' };
      return { processedCount: changes.length };
   }, 1);
   sync.change('/project/large', 'content');
   sync.change('/project/small', 'content');
   await sync.forceSync();
   await sync.forceSync();
   assert.deepEqual(sent, [['/project/large'], ['/project/small']]);
});

test('concurrent forceSync calls wait for in-flight writes and send newer edits afterwards', async () => {
   let release!: () => void;
   const wait = new Promise<void>(resolve => { release = resolve; });
   const sent: string[] = [];
   const { sync } = createSync(async changes => {
      const change = changes[0]!;
      sent.push('content' in change ? change.content : '');
      if (sent.length === 1) await wait;
      return { processedCount: changes.length };
   });
   sync.change('/project/a', 'old');
   const first = sync.forceSync();
   sync.change('/project/a', 'new');
   const second = sync.forceSync();
   assert.deepEqual(sent, ['old']);
   release();
   await Promise.all([first, second]);
   assert.deepEqual(sent, ['old', 'new']);
});

test('project reset conflicts stop retrying the remaining stale operations', async () => {
   let calls = 0;
   const { sync } = createSync(async () => {
      calls++;
      if (calls === 2) throw { data: { code: 'CONFLICT' } };
      return { processedCount: 1 };
   }, 1);
   for (const path of ['/project/a', '/project/b', '/project/c']) sync.change(path, 'content');
   await sync.forceSync();
   await sync.forceSync();
   assert.equal(calls, 2);
   assert.equal(sync.syncStatus.value, 'error');
});
