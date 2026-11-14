import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { IncomingMessage, ServerResponse, createServer } from 'node:http';
import { Socket } from 'node:net';
import { createEvent, createApp, toNodeListener } from 'h3';
import { readFile, rm, mkdir } from 'node:fs/promises';
import prisma from '../lib/prisma';
import { archive } from './github-import.test';
import {
   bind,
   begin,
   consumeState,
   userToken,
   disconnect,
} from '../server/services/github/accounts';
import { importRepository as enqueueImport, runGitHubImport } from '../server/services/github/import';
import { startTimerWorker, stopTimerWorker } from '../server/utils/timer';
import { workshopProjectService } from '../server/trpc/services/workshop-project';
import { useRedis } from '../server/utils/redis';
import webhook from '../server/api/webhooks/github.post';

test('binding, OAuth replay, token rotation, atomic binary import and project isolation', async () => {
   const database = new URL(process.env.DATABASE_URL!);
   assert.equal(database.pathname, '/quanta_github_import_test');
   assert.ok(
      [
         'localhost',
         '127.0.0.1',
      ].includes(database.hostname),
   );
   const store = process.env.LOCAL_STORE_PATH!;
   assert.ok(store.startsWith('/tmp/quanta-github-test-'));
   const users = [
      randomUUID(),
      randomUUID(),
   ];
   const config = {
      github: {
         clientId: 'test-client',
         clientSecret: 'test-secret',
         appSlug: 'test-app',
         webhookSecret: 'webhook-secret',
         tokenKey: randomBytes(32).toString('base64'),
         origin: 'http://localhost:3001',
      },
      public: {
         appBaseUrl: 'http://localhost:3001',
         workshop: {
            maxProjectsPerUser: 20,
            maxProjectBytes: 100 * 1024 * 1024,
            maxFileBytes: 20 * 1024 * 1024,
         },
      },
      redis: {
         host: '127.0.0.1',
         port: 6379,
      },
      fileSync: {
         maxChangesPerSync: 100,
      },
      achievementObserver: {
         maxCacheSize: 10,
      },
   };
   Object.assign(globalThis, {
      useRuntimeConfig: () => config,
   });
   const originalFetch = globalThis.fetch;
   const binary = Buffer.from([
      0,
      128,
      255,
      1,
   ]);
   const fixture = archive([
      {
         path: 'repo-sha/README.md',
         content: Buffer.from('# Demo'),
      },
      {
         path: 'repo-sha/image.png',
         content: binary,
      },
   ]);
   let rotations = 0;
   let unsupported = false;
   let failDownload = false;
   let oversized = false;
   let downloads = 0;
   let requests = 0;
   let onDownload: (() => Promise<void>) | undefined;
   globalThis.fetch = async (input, options) => {
      requests++;
      const url = String(input);
      const headers = new Headers(options?.headers);
      if (url === 'https://api.github.com/user') {
         return Response.json({
            id: headers.get('authorization')?.includes('second') ? 102 : 101,
            login: 'test-user',
            avatar_url: 'https://avatars.githubusercontent.com/u/101',
         });
      }
      if (url === 'https://github.com/login/oauth/access_token') {
         rotations++;
         return Response.json({
            access_token: 'rotated',
            expires_in: 3600,
            refresh_token: 'rotated-refresh',
            refresh_token_expires_in: 7200,
         });
      }
      if (url === 'https://api.github.com/repos/test/private') {
         if (!headers.has('authorization')) {
            return new Response('', {
               status: 404,
            });
         }
         return Response.json({
            id: 123,
            name: 'private',
            full_name: 'test/private',
            owner: {
               login: 'test',
            },
            private: true,
            visibility: 'private',
            description: 'Demo',
            default_branch: 'main',
         });
      }
      if (url.includes('/branches/')) {
         return Response.json({
            commit: {
               sha: 'a'.repeat(40),
            },
         });
      }
      if (url.includes('/git/trees/')) {
         return Response.json({
            truncated: false,
            tree: unsupported
               ? [
                    {
                       path: 'submodule',
                       mode: '160000',
                       type: 'commit',
                    },
                 ]
               : [
                    {
                       path: 'README.md',
                       mode: '100644',
                       type: 'blob',
                       size: oversized ? 101 * 1024 * 1024 : 6,
                    },
                    {
                       path: 'image.png',
                       mode: '100644',
                       type: 'blob',
                       size: binary.length,
                    },
                 ],
         });
      }
      if (url.includes('/tarball/')) {
         downloads++;
         return new Response(null, {
            status: 302,
            headers: {
               location:
                  'https://codeload.github.com/test/private/legacy.tar.gz/sha',
            },
         });
      }
      if (url.startsWith('https://codeload.github.com/')) {
         await onDownload?.();
         assert.ok(
            !headers.has('authorization'),
            'GitHub token must not be forwarded on redirect',
         );
         return failDownload
            ? new Response('', {
                 status: 503,
              })
            : new Response(fixture);
      }
      throw new Error(`Unexpected test request: ${url}`);
   };
   await mkdir(store, {
      recursive: true,
   });
   await prisma.user.createMany({
      data: users.map((id) => ({
         id,
         name: id,
      })),
   });
   const taskIds: string[] = [];
   const claimImport = async (projectId: string) => {
      const task = await prisma.timerTask.findFirstOrThrow({
         where: { handlerId: 'github-import', payload: { path: ['projectId'], equals: projectId } },
      });
      taskIds.push(task.id);
      return prisma.timerTask.update({
         where: { id: task.id },
         data: { status: 'running' },
      });
   };
   const importRepository = async (...args: Parameters<typeof enqueueImport>) => {
      const previousRequests = requests;
      const queued = await enqueueImport(...args);
      assert.equal(requests, previousRequests, 'enqueue must not wait for GitHub requests');
      const pending = await prisma.workshopProject.findUniqueOrThrow({
         where: { id: queued.id },
         include: { githubImport: true },
      });
      assert.equal(pending.importStatus, 'importing');
      const [ownerLogin, repositoryName] = args[1].repository.split('/');
      assert.equal(pending.githubImport?.ownerLogin, ownerLogin);
      assert.equal(pending.githubImport?.repositoryName, repositoryName);
      assert.equal(pending.githubImport?.branchName, args[1].branch);
      assert.equal(pending.githubImport?.repositoryId, null);
      assert.equal(pending.githubImport?.importedAt, null);
      await assert.rejects(workshopProjectService.get(args[0], queued.id), /正在导入中/);
      const task = await claimImport(queued.id);
      try {
         await runGitHubImport(task.payload as any, {
            taskId: task.id, handlerId: task.handlerId, claimedAt: task.updatedAt, attempts: 3,
         });
         await prisma.timerTask.update({ where: { id: task.id }, data: { status: 'done' } });
         return queued;
      } catch (error) {
         const failed = await prisma.workshopProject.findUniqueOrThrow({ where: { id: queued.id } });
         assert.equal(failed.importStatus, 'failed');
         assert.ok(failed.importError);
         await assert.rejects(workshopProjectService.get(args[0], queued.id), /导入失败/);
         await prisma.timerTask.update({ where: { id: task.id }, data: { status: 'failed' } });
         await workshopProjectService.remove(args[0], queued.id);
         throw error;
      }
   };
   try {
      await bind(users[0]!, {
         access_token: 'initial',
         expires_in: 3600,
         refresh_token: 'refresh',
         refresh_token_expires_in: 7200,
      });
      await assert.rejects(
         bind(users[1]!, {
            access_token: 'initial',
         }),
         /已绑定/,
      );
      await assert.rejects(
         bind(users[0]!, {
            access_token: 'second',
         }),
         /先解绑/,
      );
      const row = await prisma.gitHubConnection.findUniqueOrThrow({
         where: {
            userId: users[0],
         },
      });
      assert.ok(!row.accessTokenEncrypted?.includes('initial'));
      await prisma.gitHubConnection.update({
         where: {
            id: row.id,
         },
         data: {
            accessTokenExpiresAt: new Date(0),
         },
      });
      assert.deepEqual(
         await Promise.all([
            userToken(users[0]!),
            userToken(users[0]!),
         ]),
         [
            'rotated',
            'rotated',
         ],
      );
      assert.equal(rotations, 1);

      const req = new IncomingMessage(new Socket());
      req.url = '/api/trpc/github.connect';
      const res = new ServerResponse(req);
      const event = createEvent(req, res);
      const authorization = await begin(event, users[0]!, 'workshop');
      const state = new URL(authorization.url).searchParams.get('state')!;
      assert.equal(
         new URL(authorization.url).searchParams.get('code_challenge_method'),
         'S256',
      );
      req.headers.cookie = String(res.getHeader('set-cookie')).split(';')[0]!;
      assert.equal(
         (await consumeState(event, state, users[0]!, false)).target,
         'workshop',
      );
      await assert.rejects(
         consumeState(event, state, users[0]!, false),
         /过期/,
      );
      const again = await begin(event, users[0]!, 'workshop');
      await assert.rejects(
         consumeState(
            event,
            new URL(again.url).searchParams.get('state'),
            users[1]!,
            false,
         ),
         /不匹配/,
      );

      const result = await importRepository(users[0]!, {
         repository: 'test/private',
         branch: 'main',
         name: 'Demo',
      });
      const project = await prisma.workshopProject.findUniqueOrThrow({
         where: {
            id: result.id,
         },
         include: {
            githubImport: true,
            fileSystem: {
               include: {
                  files: {
                     include: {
                        asset: true,
                     },
                  },
               },
            },
         },
      });
      assert.equal(project.source, 'github');
      assert.equal(project.importStatus, 'ready');
      assert.equal(project.githubImport?.repositoryId, 123n);
      assert.ok(project.githubImport?.importedAt);
      assert.equal(project.templateId, null);
      assert.equal(project.githubImport?.commitSha, 'a'.repeat(40));
      assert.equal(project.fileSystem?.files.length, 2);
      const image = project.fileSystem!.files.find((f) => f.asset)!;
      assert.deepEqual(
         await readFile(`${store}/${image.asset!.storageKey}`),
         binary,
      );
      await assert.rejects(
         workshopProjectService.reset(users[0]!, result.id),
         /不支持重置/,
      );
      await assert.rejects(
         workshopProjectService.get(users[1]!, result.id),
         /不存在/,
      );
      assert.equal(
         (await workshopProjectService.get(users[0]!, result.id)).template,
         null,
      );

      // Deleting an import and replaying its task must never resurrect the project.
      const queued = await enqueueImport(users[1]!, { repository: 'test/private', branch: 'main', name: 'deleted' });
      const deletedTask = await claimImport(queued.id);
      await workshopProjectService.remove(users[1]!, queued.id);
      await runGitHubImport(deletedTask.payload as any, {
         taskId: deletedTask.id, handlerId: deletedTask.handlerId, claimedAt: deletedTask.updatedAt, attempts: 1,
      });
      assert.equal(await prisma.workshopProject.findUnique({ where: { id: queued.id } }), null);
      await prisma.timerTask.update({ where: { id: deletedTask.id }, data: { status: 'done' } });

      const midDownload = await enqueueImport(users[0]!, { repository: 'test/private', branch: 'main', name: 'delete during download' });
      const midDownloadTask = await claimImport(midDownload.id);
      onDownload = () => workshopProjectService.remove(users[0]!, midDownload.id);
      try {
         await runGitHubImport(midDownloadTask.payload as any, {
            taskId: midDownloadTask.id, handlerId: midDownloadTask.handlerId, claimedAt: midDownloadTask.updatedAt, attempts: 1,
         });
      } finally {
         onDownload = undefined;
      }
      assert.equal(await prisma.workshopProject.findUnique({ where: { id: midDownload.id } }), null);
      await prisma.timerTask.update({ where: { id: midDownloadTask.id }, data: { status: 'done' } });

      // A stale claim is fenced before files or ready status can be committed.
      const fenced = await enqueueImport(users[0]!, { repository: 'test/private', branch: 'main', name: 'fenced' });
      const fencedTask = await claimImport(fenced.id);
      await prisma.timerTask.update({ where: { id: fencedTask.id }, data: { updatedAt: new Date(Date.now() + 10000) } });
      await assert.rejects(runGitHubImport(fencedTask.payload as any, {
         taskId: fencedTask.id, handlerId: fencedTask.handlerId, claimedAt: fencedTask.updatedAt, attempts: 1,
      }), /TIMER_LEASE_LOST/);
      assert.equal((await prisma.workshopProject.findUniqueOrThrow({ where: { id: fenced.id } })).importStatus, 'importing');

      // Recover a claim left behind by a stopped process, then finish with the real worker.
      await prisma.timerTask.update({ where: { id: fencedTask.id }, data: { updatedAt: new Date(Date.now() - 660000) } });
      failDownload = true;
      startTimerWorker({
         pollIntervalMs: 20, batchSize: 1, concurrency: 1, retryBackoffMs: 100, maxRetryBackoffMs: 200,
         isolatedHandlers: [{ handlerId: 'github-import', concurrency: 1, leaseMs: 600000, clearPayload: true }],
      });
      try {
         const deadline = Date.now() + 10000;
         while ((await prisma.timerTask.findUniqueOrThrow({ where: { id: fencedTask.id } })).attempts < 1) {
            assert.ok(Date.now() < deadline, 'worker retry timed out');
            await new Promise(resolve => setTimeout(resolve, 10));
         }
         assert.equal((await prisma.workshopProject.findUniqueOrThrow({ where: { id: fenced.id } })).importStatus, 'importing');
         failDownload = false;
         while ((await prisma.timerTask.findUniqueOrThrow({ where: { id: fencedTask.id } })).status !== 'done') {
            assert.ok(Date.now() < deadline, 'worker timed out');
            await new Promise(resolve => setTimeout(resolve, 20));
         }
         assert.equal((await prisma.workshopProject.findUniqueOrThrow({ where: { id: fenced.id } })).importStatus, 'ready');
         assert.equal((await prisma.timerTask.findUniqueOrThrow({ where: { id: fencedTask.id } })).payload, null);
      } finally {
         stopTimerWorker();
         await workshopProjectService.remove(users[0]!, fenced.id);
      }
      const previousDownloads = downloads;
      oversized = true;
      await assert.rejects(
         importRepository(users[0]!, {
            repository: 'test/private',
            branch: 'main',
            name: 'too large',
         }),
         /超过 100 MB/,
      );
      oversized = false;
      await assert.rejects(
         importRepository(users[0]!, {
            repository: 'test/private',
            branch: 'main',
            name: 'stale preview',
            commitSha: 'b'.repeat(40),
         }),
         /分支内容已更新/,
      );
      assert.equal(
         downloads,
         previousDownloads,
         'oversized and stale imports must be rejected before downloading',
      );
      unsupported = true;
      await assert.rejects(
         importRepository(users[0]!, {
            repository: 'test/private',
            branch: 'main',
            name: 'bad',
         }),
         /子模块/,
      );
      unsupported = false;
      failDownload = true;
      await assert.rejects(
         importRepository(users[0]!, {
            repository: 'test/private',
            branch: 'main',
            name: 'bad',
         }),
         /下载失败/,
      );
      failDownload = false;
      assert.equal(
         await prisma.workshopProject.count({
            where: {
               ownerId: users[0],
            },
         }),
         1,
      );

      config.public.workshop.maxProjectsPerUser = 2;
      const concurrent = await Promise.allSettled([
         importRepository(users[0]!, {
            repository: 'test/private',
            branch: 'main',
            name: 'two',
         }),
         importRepository(users[0]!, {
            repository: 'test/private',
            branch: 'main',
            name: 'three',
         }),
      ]);
      assert.equal(
         concurrent.filter((r) => r.status === 'fulfilled').length,
         1,
      );
      await assert.rejects(
         importRepository(users[0]!, {
            repository: 'test/private',
            branch: 'main',
            name: 'over quota',
         }),
         /最多创建/,
      );
      assert.equal(
         await prisma.workshopProject.count({
            where: {
               ownerId: users[0],
            },
         }),
         2,
      );
      const server = createServer(toNodeListener(createApp().use(webhook)));
      await new Promise<void>((resolve) =>
         server.listen(0, '127.0.0.1', resolve),
      );
      try {
         const address = server.address() as {
            port: number;
         };
         const body = JSON.stringify({
            action: 'revoked',
            sender: {
               id: 101,
            },
         });
         const signature = `sha256=${createHmac('sha256', config.github.webhookSecret).update(body).digest('hex')}`;
         const url = `http://127.0.0.1:${address.port}`;
         assert.equal(
            (
               await originalFetch(url, {
                  method: 'POST',
                  body,
                  headers: {
                     'x-hub-signature-256': 'invalid',
                     'x-github-event': 'github_app_authorization',
                  },
               })
            ).status,
            401,
         );
         assert.equal(await userToken(users[0]!), 'rotated');
         for (let i = 0; i < 2; i++) {
            assert.equal(
               (
                  await originalFetch(url, {
                     method: 'POST',
                     body,
                     headers: {
                        'x-hub-signature-256': signature,
                        'x-github-event': 'github_app_authorization',
                     },
                  })
               ).status,
               200,
            );
         }
      } finally {
         await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
         );
      }
      await assert.rejects(userToken(users[0]!), /重新授权/);
      await disconnect(users[0]!);
      assert.equal(
         await prisma.workshopProject.count({
            where: {
               ownerId: users[0],
            },
         }),
         2,
      );
      assert.equal(await prisma.workshopGitHubImport.count(), 2);
      if (process.env.GITHUB_LIVE_SMOKE === '1') {
         globalThis.fetch = originalFetch;
         const live = await importRepository(users[1]!, {
            repository: 'octocat/Hello-World',
            branch: 'master',
            name: 'Public smoke',
         });
         const loaded = await workshopProjectService.get(users[1]!, live.id);
         assert.ok(
            loaded.files.some((file) => file.content?.includes('Hello World')),
         );
         console.log('Live public GitHub import passed');
      }
      Object.assign(globalThis, {
         useStorage: () => ({
            getKeys: async () => [
               'blank:template.json',
            ],
            getItemRaw: async () =>
               Buffer.from(
                  JSON.stringify({
                     name: 'Blank',
                     category: 'basic',
                     icon: '/icons/document.png',
                     order: 0,
                  }),
               ),
         }),
      });
      const template = await workshopProjectService.create({
         userId: users[1]!,
         templateId: 'blank',
         name: 'Template regression',
      });
      await workshopProjectService.sync({
         userId: users[1]!,
         projectId: template.id,
         revision: 0,
         changes: [
            {
               type: 'create',
               path: '/project/test.txt',
               content: 'changed',
            },
         ],
      });
      await workshopProjectService.reset(users[1]!, template.id);
      const reset = await workshopProjectService.get(users[1]!, template.id);
      assert.equal(reset.project.source, 'template');
      assert.equal(reset.project.revision, 1);
      assert.equal(reset.files.length, 0);
   } finally {
      stopTimerWorker();
      globalThis.fetch = originalFetch;
      await prisma.timerTask.deleteMany({ where: { id: { in: taskIds } } });
      await prisma.workshopProject.deleteMany({
         where: {
            ownerId: {
               in: users,
            },
         },
      });
      await prisma.fileAsset.deleteMany({
         where: {
            uploadedById: {
               in: users,
            },
         },
      });
      await prisma.user.deleteMany({
         where: {
            id: {
               in: users,
            },
         },
      });
      const keys = await useRedis().keys(`github:*${users[0]}*`);
      if (keys.length) {
         await useRedis().del(...keys);
      }
      useRedis().disconnect();
      await prisma.$disconnect();
      await rm(store, {
         recursive: true,
         force: true,
      });
   }
});
