import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import prisma from '../lib/prisma';
import { prepareAssets } from '../server/trpc/services/file-assets';
import { projectService } from '../server/trpc/services/project';
import { fileSyncRouter } from '../server/trpc/routes/protected/file-sync';

const dataUrl = (base64: string) => `data:application/octet-stream;base64,${base64}`;

test('sync reuses only assets referenced by the current project at request start', async () => {
   const url = new URL(process.env.DATABASE_URL ?? '');
   assert.equal(url.hostname, '127.0.0.1');
   assert.equal(url.pathname, '/quanta_file_assets_test');
   assert.equal(process.env.FILE_ASSETS_INTEGRATION_TEST, '1');
   const storePath = process.env.LOCAL_STORE_PATH;
   assert.ok(storePath?.startsWith('/tmp/quanta-file-assets-'));
   const assetsPath = path.join(storePath, 'assets');
   await mkdir(assetsPath, { recursive: true });
   const initialFiles = new Set(await readdir(assetsPath));
   const users = [randomUUID(), randomUUID()];
   const author = users[0]!;
   const student = users[1]!;
   const original = dataUrl('AAECA/8=');
   const otherProjectContent = dataUrl('CQgHBg==');
   const newContent = dataUrl('DQ4PEA==');
   const rejectedContent = dataUrl('ISIjJA==');
   let baseId: number | undefined;

   Object.assign(globalThis, {
      getRequestIP: () => '127.0.0.1',
      useRuntimeConfig: () => ({
         trackActive: { writeIntervalMs: 60_000 },
         fileSync: { maxChangesPerSync: 100 },
      }),
   });
   await prisma.user.createMany({ data: users.map((id) => ({ id, name: id })) });

   const createAsset = async (userId: string, content: string) => {
      const batch = await prepareAssets([{ path: '/project/file.bin', content }], userId);
      let committed = false;
      try {
         const [file] = await prisma.$transaction((tx) => batch.bind(tx));
         committed = true;
         return file!;
      } finally {
         await batch.cleanup(committed);
      }
   };
   const diskFiles = async () => new Set(await readdir(assetsPath));
   const countAssets = () => prisma.fileAsset.count({ where: { uploadedById: { in: users } } });

   try {
      const source = await createAsset(author, original);
      const otherSource = await createAsset(author, otherProjectContent);
      const base = await prisma.baseProblems.create({ data: { authorId: author } });
      baseId = base.id;
      const problemData = {
         baseId, title: 'test', detail: '', difficulty: 'easy' as const,
         totalScore: 100, status: 'published' as const, judgeUploadPath: '/project',
      };
      const problem = await prisma.problems.create({ data: problemData });
      const otherProblem = await prisma.problems.create({ data: problemData });
      const template = await projectService.create({
         fs: [source], isTemplate: true, userId: author, problemId: problem.pid,
      });
      await projectService.create({
         fs: [otherSource], isTemplate: true, userId: author, problemId: otherProblem.pid,
      });
      const clone = await projectService.fork({
         projectId: template.projectId, userId: student, isTemplate: false,
      });
      const sync = fileSyncRouter.createCaller({
         event: { path: '/test' }, user: { userId: student, role: 'USER' },
      } as never);
      const files = () => prisma.virtualFiles.findMany({
         where: { fileSystemFsid: clone.fileSystemId }, orderBy: { path: 'asc' },
      });
      const submit = (changes: Parameters<typeof sync.syncFileChanges>[0]['changes'], revision = 0) =>
         sync.syncFileChanges({ problemId: problem.pid, revision, changes });
      const startingDisk = await diskFiles();
      const startingCount = await countAssets();

      await submit([
         { type: 'rm', path: '/project/file.bin' },
         { type: 'create', path: '/project/first.bin', content: original },
         { type: 'create', path: '/project/second.bin', content: original },
      ]);
      assert.deepEqual((await files()).map((file) => file.assetId), [source.assetId, source.assetId]);
      assert.equal(await countAssets(), startingCount);
      assert.deepEqual(await diskFiles(), startingDisk);

      await submit([
         { type: 'create', path: '/project/third.bin', content: original },
         { type: 'rm', path: '/project/first.bin' },
         { type: 'rm', path: '/project/second.bin' },
      ]);
      assert.equal((await files())[0]!.assetId, source.assetId);
      assert.equal(await countAssets(), startingCount);
      assert.deepEqual(await diskFiles(), startingDisk);

      const studentCopy = await createAsset(student, original);
      assert.notEqual(studentCopy.assetId, source.assetId);
      const bothDisk = await diskFiles();
      const bothCount = await countAssets();
      await submit([
         { type: 'rm', path: '/project/third.bin' },
         { type: 'create', path: '/project/fourth.bin', content: original },
      ]);
      assert.equal((await files())[0]!.assetId, source.assetId);
      assert.equal(await countAssets(), bothCount);
      assert.deepEqual(await diskFiles(), bothDisk);
      assert.equal((await prisma.fileAsset.findUniqueOrThrow({ where: { id: source.assetId! } })).uploadedById, author);

      const ownAsset = await prisma.fileAsset.findUniqueOrThrow({ where: { id: studentCopy.assetId! } });
      const ownPath = path.join(storePath, ownAsset.storageKey);
      const ownBytes = await readFile(ownPath);
      await rm(ownPath);
      try {
         await submit([
            { type: 'rm', path: '/project/fourth.bin' },
            { type: 'create', path: '/project/fourth.bin', content: original },
         ]);
         assert.equal((await files())[0]!.assetId, source.assetId);
      } finally {
         await writeFile(ownPath, ownBytes);
      }
      assert.deepEqual(await diskFiles(), bothDisk);

      const sourceAsset = await prisma.fileAsset.findUniqueOrThrow({ where: { id: source.assetId! } });
      const sourcePath = path.join(storePath, sourceAsset.storageKey);
      const sourceBytes = await readFile(sourcePath);
      await rm(sourcePath);
      try {
         await assert.rejects(submit([
            { type: 'rm', path: '/project/fourth.bin' },
            { type: 'create', path: '/project/fourth.bin', content: original },
            { type: 'create', path: '/project/rejected.bin', content: rejectedContent },
         ]));
         assert.equal((await files())[0]!.assetId, source.assetId);
      } finally {
         await writeFile(sourcePath, sourceBytes);
      }
      assert.equal(await countAssets(), bothCount);
      assert.deepEqual(await diskFiles(), bothDisk);

      await submit([
         { type: 'create', path: '/project/different.bin', content: newContent },
         { type: 'create', path: '/project/other.bin', content: otherProjectContent },
      ]);
      const expanded = await files();
      assert.notEqual(expanded.find((file) => file.path.endsWith('/different.bin'))!.assetId, source.assetId);
      assert.notEqual(expanded.find((file) => file.path.endsWith('/other.bin'))!.assetId, otherSource.assetId);
      assert.equal(await countAssets(), bothCount + 2);

      const beforeFailure = await diskFiles();
      const beforeCount = await countAssets();
      const beforeFiles = await files();
      await assert.rejects(submit([
         { type: 'rm', path: '/project/fourth.bin' },
         { type: 'create', path: '/project/rejected.bin', content: rejectedContent },
      ], 99), /reset/);
      await assert.rejects(submit([
         { type: 'rm', path: '/project/fourth.bin' },
         { type: 'create', path: '/project/rejected.bin', content: rejectedContent },
         { type: 'mv', oldPath: '/project/rejected.bin', newPath: '/project/invalid\0path' },
      ]));
      assert.deepEqual(await files(), beforeFiles);
      assert.equal(await countAssets(), beforeCount);
      assert.deepEqual(await diskFiles(), beforeFailure);

      await submit([{ type: 'rm', path: '/project/fourth.bin' }]);
      await submit([{ type: 'create', path: '/project/later.bin', content: original }]);
      assert.equal((await files()).find((file) => file.path.endsWith('/later.bin'))!.assetId, studentCopy.assetId);
      assert.equal(await countAssets(), beforeCount);
      assert.deepEqual(await diskFiles(), beforeFailure);
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
      const remaining = await readdir(assetsPath);
      await Promise.all(remaining.filter((name) => !initialFiles.has(name)).map((name) => rm(path.join(assetsPath, name))));
      await prisma.$disconnect();
   }
});
