import prisma from '~~/lib/prisma';
import { api, githubError, repositorySummary, type Repository } from './client';
import { parseRepository } from './core';
import { userToken } from './accounts';
import { downloadRepository } from './download';
import { readRepositoryTree } from './tree';
import { prepareAssets } from '../../trpc/services/file-assets';
import { getWorkshopLimits } from '../../trpc/services/workshop-project';
import {
   dispatchTimerTask,
   registerTimerHandler,
   withTimerTaskLease,
   type TimerTaskSnapshot,
} from '../../utils/timer';

type ImportInput = {
   repository: string;
   branch: string;
   name: string;
   commitSha?: string;
};

type ImportTask = { projectId: string; userId: string; input: ImportInput };
const MAX_ATTEMPTS = 3;

/** Reserve quota and enqueue atomically; no GitHub requests run in this mutation. */
export async function importRepository(userId: string, input: ImportInput) {
   let repository: string;
   try {
      repository = parseRepository(input.repository);
   } catch {
      throw githubError('请填写 GitHub 仓库链接或 owner/repository');
   }
   const [ownerLogin, repositoryName] = repository.split('/') as [string, string];
   registerGitHubImportHandler();
   return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`workshop-create:${userId}`}, 0))`;
      const limits = getWorkshopLimits();
      const count = await tx.workshopProject.count({ where: { ownerId: userId } });
      if (count >= limits.maxProjectsPerUser) {
         throw githubError(`每位用户最多创建 ${limits.maxProjectsPerUser} 个项目`);
      }
      const project = await tx.workshopProject.create({
         data: {
            ownerId: userId,
            name: input.name,
            source: 'github',
            importStatus: 'importing',
            githubImport: {
               create: {
                  ownerLogin,
                  repositoryName,
                  branchName: input.branch,
                  commitSha: input.commitSha,
               },
            },
         },
         select: { id: true },
      });
      await dispatchTimerTask<ImportTask>(
         'github-import',
         { projectId: project.id, userId, input: { ...input, repository } },
         { maxAttempts: MAX_ATTEMPTS },
         tx,
      );
      return project;
   });
}

export function registerGitHubImportHandler() {
   if (handlerRegistered) return;
   registerTimerHandler<ImportTask>('github-import', runGitHubImport);
   handlerRegistered = true;
}

let handlerRegistered = false;

export async function runGitHubImport(payload: ImportTask, task: TimerTaskSnapshot) {
   const { projectId, userId } = payload;
   try {
      const project = await prisma.workshopProject.findUnique({
         where: { id: projectId },
      });
      // Deleted projects must never be recreated; a replay after commit is a no-op.
      if (!project || project.ownerId !== userId || project.importStatus !== 'importing') return;
      await completeImport(payload, task);
   } catch (error) {
      if (error instanceof Error && error.message === 'TIMER_LEASE_LOST') throw error;
      if (task.attempts >= MAX_ATTEMPTS) {
         await withTimerTaskLease(task, tx => tx.workshopProject.updateMany({
            where: { id: projectId, ownerId: userId, importStatus: 'importing' },
            data: {
               importStatus: 'failed',
               importError: error instanceof Error
                  ? error.message.slice(0, 500)
                  : '导入失败，请删除项目后重新导入',
            },
         }));
      }
      throw error;
   }
}

export async function resolveRepository(userId: string, input: string) {
   let path: string;
   try {
      path = parseRepository(input);
   } catch {
      throw githubError('请填写 GitHub 仓库链接或 owner/repository');
   }
   // Public repositories remain importable even without an App installation.
   try {
      return {
         repo: await api<Repository>(`/repos/${path}`),
         token: undefined,
      };
   } catch (error) {
      const token = await userToken(userId, true);
      if (!token) {
         throw error;
      }
      return {
         repo: await api<Repository>(`/repos/${path}`, token),
         token,
      };
   }
}

export async function inspectRepository(
   userId: string,
   input: string,
   page: number,
) {
   const { repo, token } = await resolveRepository(userId, input);
   const branches = await api<
      {
         name: string;
      }[]
   >(`/repositories/${repo.id}/branches?per_page=100&page=${page}`, token);
   return {
      repository: repositorySummary(repo),
      branches: branches.map((b) => b.name),
      hasMore: branches.length === 100,
   };
}

export async function previewRepository(
   userId: string,
   input: {
      repository: string;
      branch: string;
   },
) {
   const { repo, token } = await resolveRepository(userId, input.repository);
   return readRepositoryTree(repo.id, input.branch, token, getWorkshopLimits());
}

async function completeImport(
   { projectId, userId, input }: ImportTask,
   task: TimerTaskSnapshot,
) {
   const limits = getWorkshopLimits();
   const signal = AbortSignal.timeout(240000);
   const { repo, token } = await resolveRepository(userId, input.repository);
   const preview = await readRepositoryTree(
      repo.id,
      input.branch,
      token,
      limits,
      signal,
   );
   if (input.commitSha && preview.commitSha !== input.commitSha) {
      throw githubError('分支内容已更新，请刷新目录预览后重新导入');
   }
   if (!preview.canImport) {
      throw githubError(preview.reason);
   }
   const sha = preview.commitSha;
   const snapshot = await downloadRepository(
      repo, sha, token,
      { ...limits, maxProjectBytes: preview.maxProjectBytes },
      signal,
   );
   signal.throwIfAborted();
   const assets = await prepareAssets(snapshot.files, userId);
   let committed = false;
   try {
      committed = await withTimerTaskLease(
         task,
         async (tx) => {
            const rows = await tx.$queryRaw<{ id: string }[]>`
               SELECT id FROM workshop_projects
               WHERE id = ${projectId} AND "ownerId" = ${userId} AND "importStatus" = 'importing'
               FOR UPDATE
            `;
            if (!rows.length) return false;
            const files = await assets.bind(tx);
            const githubImport = {
               repositoryId: BigInt(repo.id),
               ownerLogin: repo.owner.login,
               repositoryName: repo.name,
               visibility: repo.visibility ?? (repo.private ? 'private' : 'public'),
               branchName: input.branch,
               commitSha: sha,
               importedAt: new Date(),
            };
            const project = await tx.workshopProject.update({
               where: { id: projectId },
               data: {
                  description: repo.description?.slice(0, 200),
                  importStatus: 'ready',
                  importError: null,
                  sizeBytes: BigInt(snapshot.sizeBytes),
                  githubImport: {
                     upsert: {
                        create: githubImport,
                        update: githubImport,
                     },
                  },
                  fileSystem: {
                     create: {
                        ownerId: userId,
                     },
                  },
               },
               select: {
                  id: true,
                  fileSystem: {
                     select: {
                        fsid: true,
                     },
                  },
               },
            });
            if (files.length) {
               await tx.virtualFiles.createMany({
                  data: files.map(({ path, content, assetId }) => ({
                     path,
                     content,
                     assetId,
                     ownerId: userId,
                     fileSystemFsid: project.fileSystem!.fsid,
                  })),
               });
            }
            return true;
         },
         {
            timeout: 30000,
         },
      );
   } finally {
      await assets.cleanup(committed);
   }
}
