import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import prisma from '../lib/prisma';
import { registerTimerHandler } from '../server/utils/timer';

test('upload and reupload preserve assets and enforce the CLI version', async () => {
   const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
   assert.equal(databaseUrl.hostname, '127.0.0.1');
   assert.equal(databaseUrl.pathname, '/quanta_file_assets_test');
   assert.equal(process.env.FILE_ASSETS_INTEGRATION_TEST, '1');
   const storePath = process.env.LOCAL_STORE_PATH;
   assert.ok(storePath?.startsWith('/tmp/quanta-file-assets-'));
   const assetsPath = path.join(storePath, 'assets');
   await mkdir(assetsPath, { recursive: true });
   const initialFiles = new Set(await readdir(assetsPath));

   const userId = randomUUID();
   const previousFetch = globalThis.fetch;
   Object.assign(globalThis, {
      getRequestIP: () => '127.0.0.1',
      useRuntimeConfig: () => ({
         trackActive: { writeIntervalMs: 60_000 },
         quanta: { minCliVersion: '1.2.3' },
         judge: { serverUrl: 'http://judge.invalid' },
         llm: { model: 'test-model' },
      }),
      fetch: async () => new Response(JSON.stringify({ code: 'export default function judge() {}' })),
   });
   const { problemRouter } = await import('../server/trpc/routes/admin/problem');
   registerTimerHandler('judge-quality', async () => {});

   const caller = (version: string) => problemRouter.createCaller({
      event: {
         path: '/test',
         node: { req: { headers: { 'x-quanta-cli-version': version } } },
      },
      user: { userId, role: 'ADMIN' },
   } as never);
   const dataUrl = 'data:application/octet-stream;base64,AAECA/8=';
   let baseId: number | undefined;
   let imageId: string | undefined;
   let problemId: number | undefined;
   try {
      await prisma.user.create({ data: { id: userId, name: userId, role: 'ADMIN' } });
      const tag = await prisma.tags.create({ data: { name: userId, creatorId: userId } });
      const input = {
         title: 'Asset upload test',
         detail: 'Test detail',
         tagIds: [tag.tid],
         judgeScript: 'export default function judge() {}',
         difficulty: 'easy' as const,
         totalScore: 100,
         answerTemplateSnapshot: { '/project/image.png': dataUrl },
         referenceAnswerSnapshot: { '/project/reference.wasm': dataUrl },
         coverMode: 'default' as const,
         initCommand: 'npm install',
         judgeUploadPath: '/project',
      };

      await assert.rejects(caller('1.2.2').upload(input), /版本过低/);
      assert.equal(await prisma.baseProblems.count({ where: { authorId: userId } }), 0);
      assert.equal(await prisma.fileAsset.count({ where: { uploadedById: userId } }), 0);
      assert.deepEqual(new Set(await readdir(assetsPath)), initialFiles);

      const uploaded = await caller('1.2.3').upload(input);
      problemId = uploaded.problemId;
      const problem = await prisma.problems.findUniqueOrThrow({ where: { pid: problemId } });
      baseId = problem.baseId;
      const file = await prisma.virtualFiles.findFirstOrThrow({
         where: { FileSystem: { project: { problemId, isTemplate: true } } },
      });
      assert.equal(file.content, null);
      assert.ok(file.assetId);
      const task = await prisma.timerTask.findFirstOrThrow({
         where: { handlerId: 'judge-quality', payload: { path: ['problemId'], equals: problemId } },
      });
      const payload = task.payload as { fsSnapshot: Record<string, string> };
      assert.equal(payload.fsSnapshot['/project/reference.wasm'], dataUrl);

      await prisma.virtualFiles.update({
         where: { vid: file.vid },
         data: { content: 'AAECA/8=', assetId: null },
      });
      const image = await prisma.image.create({ data: { name: `${userId}.png` } });
      imageId = image.id;
      await prisma.problemDefaultCovers.create({ data: { problemId, imageId } });
      const reuploadInput = { ...input, baseId };
      const assetCount = await prisma.fileAsset.count({ where: { uploadedById: userId } });
      const diskFiles = new Set(await readdir(assetsPath));
      await assert.rejects(caller('1.2.2').reupload(reuploadInput), /版本过低/);
      assert.equal(await prisma.problems.count({ where: { baseId } }), 1);
      assert.equal(await prisma.fileAsset.count({ where: { uploadedById: userId } }), assetCount);
      assert.deepEqual(new Set(await readdir(assetsPath)), diskFiles);

      for (const status of ['ready', 'published'] as const) {
         await prisma.problems.update({ where: { pid: problemId }, data: { status } });
         const result = await caller('1.2.3').reupload(reuploadInput);
         assert.equal(result.mode, 'quick');
         assert.equal(result.problemId, problemId);
         assert.deepEqual(result.auditReasons, []);
         assert.equal(await prisma.problems.count({ where: { baseId } }), 1);
         assert.equal(await prisma.fileAsset.count({ where: { uploadedById: userId } }), assetCount);
         assert.deepEqual(new Set(await readdir(assetsPath)), diskFiles);
      }
   } finally {
      globalThis.fetch = previousFetch;
      if (problemId) {
         await prisma.timerTask.deleteMany({ where: { payload: { path: ['problemId'], equals: problemId } } });
      }
      await prisma.virtualFiles.deleteMany({ where: { ownerId: userId } });
      await prisma.fileSystems.deleteMany({ where: { ownerId: userId } });
      await prisma.projects.deleteMany({ where: { ownerId: userId } });
      if (baseId) {
         await prisma.baseProblems.update({ where: { id: baseId }, data: { currentPid: null } });
         await prisma.problems.deleteMany({ where: { baseId } });
         await prisma.baseProblems.delete({ where: { id: baseId } });
      }
      if (imageId) await prisma.image.delete({ where: { id: imageId } });
      await prisma.fileAsset.deleteMany({ where: { uploadedById: userId } });
      await prisma.tags.deleteMany({ where: { creatorId: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      const remaining = await readdir(assetsPath);
      await Promise.all(remaining.filter((name) => !initialFiles.has(name)).map((name) => rm(path.join(assetsPath, name))));
      await prisma.$disconnect();
   }
});
