import prisma from '~~/lib/prisma';
import { api, githubError, repositorySummary, type Repository } from './client';
import { opaque, parseRepository } from './core';
import { userToken } from './accounts';
import { ignored, readArchive, unpackArchive } from './archive';
import { prepareAssets } from '../../trpc/services/file-assets';
import { getWorkshopLimits } from '../../trpc/services/workshop-project';
import { useRedis } from '../../utils/redis';

export async function resolveRepository(userId: string, input: string) {
   let path: string;
   try { path = parseRepository(input); } catch { throw githubError('请填写 GitHub 仓库链接或 owner/repository'); }
   // Public repositories remain importable even without an App installation.
   try { return { repo: await api<Repository>(`/repos/${path}`), token: undefined }; }
   catch (error) {
      const token = await userToken(userId, true);
      if (!token) throw error;
      return { repo: await api<Repository>(`/repos/${path}`, token), token };
   }
}

export async function inspectRepository(userId: string, input: string, page: number) {
   const { repo, token } = await resolveRepository(userId, input);
   const branches = await api<{ name: string }[]>(`/repositories/${repo.id}/branches?per_page=100&page=${page}`, token);
   return { repository: repositorySummary(repo), branches: branches.map(b => b.name), hasMore: branches.length === 100 };
}

export async function importRepository(userId: string, input: { repository: string; branch: string; name: string }) {
   const redis = useRedis();
   const lock = `github:import:${userId}`;
   const nonce = opaque();
   if (!await redis.set(lock, nonce, 'EX', 300, 'NX')) throw githubError('已有仓库正在导入，请稍候');
   try {
      const limits = getWorkshopLimits();
      if (await prisma.workshopProject.count({ where: { ownerId: userId } }) >= limits.maxProjectsPerUser) throw githubError(`每位用户最多创建 ${limits.maxProjectsPerUser} 个项目`);
      const { repo, token } = await resolveRepository(userId, input.repository);
      const signal = AbortSignal.timeout(120000);
      const branch = await api<{ commit: { sha: string } }>(`/repositories/${repo.id}/branches/${encodeURIComponent(input.branch)}`, token, signal);
      const sha = branch.commit.sha;
      const tree = await api<{ truncated: boolean; tree: { path: string; mode: string }[] }>(`/repositories/${repo.id}/git/trees/${sha}?recursive=1`, token, signal);
      if (tree.truncated || tree.tree.length > 5000) throw githubError('仓库条目数过多，暂不支持导入');
      if (tree.tree.some(item => !ignored(item.path) && ['120000', '160000'].includes(item.mode))) throw githubError('第一版暂不支持包含符号链接或子模块的仓库');
      const first = await fetch(`https://api.github.com/repositories/${repo.id}/tarball/${sha}`, {
         headers: { 'User-Agent': 'Quanta-Challenge', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, redirect: 'manual', signal,
      });
      if (first.status !== 302 || !first.headers.get('location')) { await first.body?.cancel(); throw githubError('仓库下载失败，请检查授权'); }
      const location = new URL(first.headers.get('location')!);
      await first.body?.cancel();
      if (location.origin !== 'https://codeload.github.com') throw githubError('仓库下载地址不受支持');
      const response = await fetch(location, { redirect: 'error', signal });
      if (!response.ok) { await response.body?.cancel(); throw githubError('仓库下载失败，请稍后重试'); }
      let snapshot: Awaited<ReturnType<typeof unpackArchive>>;
      try { snapshot = await unpackArchive(await readArchive(response, signal), limits); }
      catch (error) { throw githubError(error instanceof Error ? error.message : '仓库解压失败'); }
      signal.throwIfAborted();
      const assets = await prepareAssets(snapshot.files, userId);
      let committed = false;
      try {
         const result = await prisma.$transaction(async tx => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`workshop-create:${userId}`}, 0))`;
            if (await tx.workshopProject.count({ where: { ownerId: userId } }) >= limits.maxProjectsPerUser) throw githubError(`每位用户最多创建 ${limits.maxProjectsPerUser} 个项目`);
            const files = await assets.bind(tx);
            const project = await tx.workshopProject.create({
               data: { ownerId: userId, name: input.name, description: repo.description?.slice(0, 200), source: 'github', templateId: null, sizeBytes: BigInt(snapshot.sizeBytes),
                  githubImport: { create: { repositoryId: BigInt(repo.id), ownerLogin: repo.owner.login, repositoryName: repo.name, visibility: repo.visibility ?? (repo.private ? 'private' : 'public'), branchName: input.branch, commitSha: sha } },
                  fileSystem: { create: { ownerId: userId } } },
               select: { id: true, fileSystem: { select: { fsid: true } } },
            });
            if (files.length) await tx.virtualFiles.createMany({ data: files.map(({ path, content, assetId }) => ({ path, content, assetId, ownerId: userId, fileSystemFsid: project.fileSystem!.fsid })) });
            return { id: project.id };
         }, { timeout: 30000 });
         committed = true;
         return result;
      } finally { await assets.cleanup(committed); }
   } finally {
      await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, lock, nonce);
   }
}
