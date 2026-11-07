import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import prisma from '../lib/prisma';
import { collectOrphanAssetFiles, expandFile, prepareAssets, readProjectAsset } from '../server/trpc/services/file-assets';
import { projectService } from '../server/trpc/services/project';
import { fileSyncRouter } from '../server/trpc/routes/protected/file-sync';
import { problemRouter } from '../server/trpc/routes/protected/problem';

test('asset deduplication, isolation, rollback and integrity constraints', async () => {
   const url = new URL(process.env.DATABASE_URL ?? '');
   assert.equal(url.hostname, '127.0.0.1');
   assert.equal(url.pathname, '/quanta_file_assets_test');
   assert.equal(process.env.FILE_ASSETS_INTEGRATION_TEST, '1');
   const storePath = process.env.LOCAL_STORE_PATH;
   assert.ok(storePath?.startsWith('/tmp/quanta-file-assets-'));

   const users = [randomUUID(), randomUUID()];
   const content = 'data:application/octet-stream;base64,AAECA/8=';
   const files = [{ path: '/project/test.bin', content }];
   Object.assign(globalThis, {
      getRequestIP: () => '127.0.0.1',
      useRuntimeConfig: () => ({
         trackActive: { writeIntervalMs: 60_000 },
         fileSync: { maxChangesPerSync: 100 },
      }),
   });
   await mkdir(path.join(storePath, 'assets'), { recursive: true });
   const initialFiles = new Set(await readdir(path.join(storePath, 'assets')));
   await prisma.user.createMany({ data: users.map((id) => ({ id, name: id })) });
   let baseId: number | undefined;
   try {
      const prepared = await Promise.all([
         prepareAssets(files, users[0]!),
         prepareAssets(files, users[0]!),
         prepareAssets(files, users[1]!),
      ]);
      const results = await Promise.all(prepared.map(async (batch) => {
         let committed = false;
         try {
            const bound = await prisma.$transaction((tx) => batch.bind(tx));
            committed = true;
            return bound;
         } finally {
            await batch.cleanup(committed);
         }
      }));
      assert.equal(results[0]![0]!.assetId, results[1]![0]!.assetId);
      assert.notEqual(results[0]![0]!.assetId, results[2]![0]!.assetId);
      assert.equal((await expandFile(results[0]![0]!)).content, content);
      assert.equal(projectService.isSameFiles(
         [{ path: '/project/example.png', content: 'AAECA/8=' }],
         [{ path: 'example.png', content }],
      ), true);
      assert.equal(projectService.isSameFiles(
         [{ path: '/project/example.png', content: 'AAECA/8=' }],
         [{ path: 'example.png', content: 'data:application/octet-stream;base64,AAECAA==' }],
      ), false);
      await assert.rejects(prepareAssets([
         { path: '/invalid.bin', content: 'data:application/octet-stream;base64,AB==' },
      ], users[0]!));
      const savedAsset = await prisma.fileAsset.findUniqueOrThrow({ where: { id: results[0]![0]!.assetId! } });
      const savedPath = path.join(storePath, savedAsset.storageKey);
      const savedBytes = await readFile(savedPath);
      await rm(savedPath);
      try {
         await assert.rejects(prepareAssets(files, users[0]!));
      } finally {
         await writeFile(savedPath, savedBytes);
      }
      assert.equal(await prisma.fileAsset.count({ where: { uploadedById: { in: users } } }), 2);
      assert.equal((await readdir(path.join(storePath, 'assets'))).filter((name) => !initialFiles.has(name)).length, 2);

      const base = await prisma.baseProblems.create({ data: { authorId: users[0]! } });
      baseId = base.id;
      const problem = await prisma.problems.create({
         data: {
            baseId: base.id, title: 'test', detail: '', difficulty: 'easy',
            totalScore: 100, status: 'published', judgeUploadPath: '/project',
         },
      });
      const template = await projectService.create({
         fs: results[0]!, isTemplate: true, userId: users[0]!, problemId: problem.pid,
      });
      const clone = await projectService.fork({
         projectId: template.projectId, userId: users[1]!, isTemplate: false,
      });
      const assetId = results[0]![0]!.assetId!;
      assert.equal(await readProjectAsset(users[1]!, clone.projectId, assetId), content);
      await assert.rejects(readProjectAsset(users[1]!, template.projectId, assetId));
      await assert.rejects(readProjectAsset(users[0]!, clone.projectId, assetId));
      await assert.rejects(prisma.fileAsset.delete({ where: { id: assetId } }));

      const context = {
         event: { path: '/test' },
         user: { userId: users[1]!, role: 'USER' },
      } as never;
      const sync = fileSyncRouter.createCaller(context);
      const problems = problemRouter.createCaller(context);
      await prisma.virtualFiles.createMany({
         data: [
            { path: '/project/legacy.png', content: 'AAECA/8=', ownerId: users[1]!, fileSystemFsid: clone.fileSystemId },
            { path: '/project/old/legacy.png', content: 'AAECA/8=', ownerId: users[1]!, fileSystemFsid: clone.fileSystemId },
         ],
      });
      await sync.syncFileChanges({
         problemId: problem.pid,
         revision: 0,
         changes: [
            { type: 'mv', oldPath: '/project/legacy.png', newPath: '/project/legacy.bin' },
            { type: 'mv', oldPath: '/project/old', newPath: '/project/new' },
            { type: 'change', path: '/project/test.bin', content: 'hello' },
            { type: 'change', path: '/project/test.bin', content },
         ],
      });
      const synced = await prisma.virtualFiles.findMany({ where: { fileSystemFsid: clone.fileSystemId } });
      assert.equal(synced.find((file) => file.path === '/project/test.bin')?.assetId !== null, true);
      assert.equal(synced.find((file) => file.path === '/project/legacy.bin')?.content, content);
      assert.equal(synced.find((file) => file.path === '/project/new/legacy.png')?.content, content);
      await sync.syncFileChanges({
         problemId: problem.pid,
         revision: 0,
         changes: [{ type: 'change', path: '/project/test.bin', content: 'text again' }],
      });
      const changed = await prisma.virtualFiles.findFirstOrThrow({ where: { fileSystemFsid: clone.fileSystemId, path: '/project/test.bin' } });
      assert.equal(changed.content, 'text again');
      assert.equal(changed.assetId, null);
      await problems.resetProject({ problemId: problem.pid });
      const resetFiles = await prisma.virtualFiles.findMany({ where: { fileSystemFsid: clone.fileSystemId } });
      assert.equal(resetFiles.length, 1);
      assert.equal(resetFiles[0]!.assetId, assetId);
      const beforeStale = new Set(await readdir(path.join(storePath, 'assets')));
      await assert.rejects(sync.syncFileChanges({
         problemId: problem.pid,
         revision: 0,
         changes: [{ type: 'change', path: '/project/test.bin', content: 'data:application/octet-stream;base64,ICEi' }],
      }), /reset/);
      assert.deepEqual(new Set(await readdir(path.join(storePath, 'assets'))), beforeStale);
      await prisma.problems.update({ where: { pid: problem.pid }, data: { status: 'draft' } });
      await assert.rejects(problems.getOrForkProject({ problemId: problem.pid }), /Problem not found/);

      const rollback = await prepareAssets([
         { path: '/project/other.bin', content: 'data:application/octet-stream;base64,AQIDBA==' },
      ], users[0]!);
      try {
         await assert.rejects(prisma.$transaction(async (tx) => {
            await rollback.bind(tx);
            throw new Error('rollback');
         }), /rollback/);
      } finally {
         await rollback.cleanup(false);
      }
      assert.equal((await readdir(path.join(storePath, 'assets'))).filter((name) => !initialFiles.has(name)).length, 2);
      assert.equal(await prisma.fileAsset.count({ where: { uploadedById: { in: users } } }), 2);
      await assert.rejects(prisma.virtualFiles.create({
         data: { path: '/bad', ownerId: users[0]!, content: null, assetId: null },
      }));
      await assert.rejects(prisma.virtualFiles.create({
         data: { path: '/bad', ownerId: users[0]!, content: '', assetId: results[0]![0]!.assetId },
      }));

      const beforeCandidate = new Set(await readdir(path.join(storePath, 'assets')));
      const stale = await prepareAssets([
         { path: '/stale.bin', content: 'data:application/octet-stream;base64,CQoLDA==' },
      ], users[0]!);
      const candidates = (await readdir(path.join(storePath, 'assets'))).filter((name) => !beforeCandidate.has(name));
      assert.equal(candidates.length, 1);
      const oldDate = new Date('1970-01-02T00:00:00Z');
      await utimes(path.join(storePath, 'assets', candidates[0]!), oldDate, oldDate);
      await collectOrphanAssetFiles(new Date('1970-01-03T00:00:00Z'));
      await assert.rejects(prisma.$transaction((tx) => stale.bind(tx)));
      await stale.cleanup(false);
      assert.equal(await prisma.fileAsset.count({ where: { uploadedById: { in: users } } }), 2);

      const pair = [
         { path: '/a.bin', content: 'data:application/octet-stream;base64,EBES' },
         { path: '/b.bin', content: 'data:application/octet-stream;base64,ExQV' },
      ];
      const batches = await Promise.all([
         prepareAssets(pair, users[0]!),
         prepareAssets([...pair].reverse(), users[0]!),
      ]);
      const bound = await Promise.all(batches.map(async (batch) => {
         let committed = false;
         try {
            const result = await prisma.$transaction((tx) => batch.bind(tx));
            committed = true;
            return result;
         } finally {
            await batch.cleanup(committed);
         }
      }));
      assert.equal(bound[0]![0]!.assetId, bound[1]![1]!.assetId);
      assert.equal(bound[0]![1]!.assetId, bound[1]![0]!.assetId);
   } finally {
      await prisma.virtualFiles.deleteMany({ where: { ownerId: { in: users } } });
      await prisma.fileSystems.deleteMany({ where: { ownerId: { in: users } } });
      await prisma.projects.deleteMany({ where: { ownerId: { in: users } } });
      if (baseId) {
         await prisma.problems.deleteMany({ where: { baseId } });
         await prisma.baseProblems.delete({ where: { id: baseId } });
      }
      await prisma.fileAsset.deleteMany({ where: { uploadedById: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      const remaining = await readdir(path.join(storePath, 'assets'));
      await Promise.all(remaining.filter((name) => !initialFiles.has(name)).map((name) => rm(path.join(storePath, 'assets', name))));
      await prisma.$disconnect();
   }
});
