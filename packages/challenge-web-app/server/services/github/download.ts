import { readArchive, unpackArchive } from './archive';
import { githubError, type Repository } from './client';

function archiveMirrorTemplates(raw: unknown): string[] {
   // Nuxt can deserialize a NUXT_* JSON value before exposing runtimeConfig.
   const templates: unknown = typeof raw === 'string'
      ? (raw.trim() ? JSON.parse(raw) : []) : raw ?? [];
   if (!Array.isArray(templates) || templates.length > 10) {
      throw new Error('GitHub 归档镜像配置必须为最多 10 项的 JSON 数组');
   }
   return templates.map((template: unknown) => {
      if (typeof template !== 'string' || !/\{(url|sha)\}/.test(template)) {
         throw new Error('GitHub 归档镜像必须包含 {url} 或 {sha}');
      }
      return template;
   });
}

export function getGitHubDownloadConfig() {
   const config = useRuntimeConfig().github;
   const mirrors = archiveMirrorTemplates(
      config.archiveMirrors || process.env.GITHUB_ARCHIVE_MIRRORS || '',
   );
   const configuredTimeout = Number(
      process.env.NUXT_GITHUB_ARCHIVE_TIMEOUT_MS ||
      process.env.GITHUB_ARCHIVE_TIMEOUT_MS || config.archiveTimeoutMs || 300000,
   );
   const timeoutMs = Number.isFinite(configuredTimeout)
      ? Math.max(1000, Math.min(300000, Math.floor(configuredTimeout))) : 300000;
   // Each mirror and the origin get a full timeout; allow one minute for metadata.
   const taskTimeoutMs = timeoutMs * (mirrors.length + 1) + 60000;
   return {
      mirrors,
      timeoutMs,
      taskTimeoutMs,
      leaseMs: Math.max(10 * 60000, taskTimeoutMs + 4 * 60000),
   };
}

export function archiveMirrorUrls(raw: unknown, repo: Repository, sha: string) {
   if (repo.private || repo.visibility === 'internal') return [];
   const owner = encodeURIComponent(repo.owner.login);
   const name = encodeURIComponent(repo.name);
   const url = `https://github.com/${owner}/${name}/archive/${sha}.tar.gz`;
   return archiveMirrorTemplates(raw).map((template) => {
      const resolved = new URL(template
         .replaceAll('{url}', url)
         .replaceAll('{owner}', owner)
         .replaceAll('{repo}', name)
         .replaceAll('{sha}', sha));
      if (resolved.protocol !== 'https:' || resolved.username || resolved.password || resolved.hash) {
         throw new Error('GitHub 归档镜像必须使用无凭据的 HTTPS 地址');
      }
      return resolved.href;
   });
}

async function originalArchive(
   repo: Repository,
   sha: string,
   token: string | undefined,
   signal: AbortSignal,
) {
   const first = await fetch(`https://api.github.com/repositories/${repo.id}/tarball/${sha}`, {
      headers: {
         'User-Agent': 'Quanta-Challenge',
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: 'manual',
      signal,
   });
   const location = first.headers.get('location');
   await first.body?.cancel();
   if (first.status !== 302 || !location) {
      throw githubError('仓库下载失败，请检查授权');
   }
   const target = new URL(location);
   if (target.origin !== 'https://codeload.github.com' || target.username || target.password) {
      throw githubError('仓库下载地址不受支持');
   }
   // Only the GitHub API receives credentials, never a mirror or redirect target.
   return fetch(target, { redirect: 'error', signal });
}

export async function downloadRepository(
   repo: Repository,
   sha: string,
   token: string | undefined,
   limits: { maxFileBytes: number; maxProjectBytes: number },
   signal: AbortSignal,
) {
   const config = getGitHubDownloadConfig();
   const mirrors = archiveMirrorUrls(config.mirrors, repo, sha);
   // A complete download AND extraction must succeed before selecting a source.
   for (const mirror of [...mirrors, null]) {
      signal.throwIfAborted();
      const attemptSignal = AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]);
      try {
         const response = mirror
            ? await fetch(mirror, { redirect: 'error', signal: attemptSignal })
            : await originalArchive(repo, sha, token, attemptSignal);
         if (!response.ok) {
            await response.body?.cancel();
            throw githubError('仓库下载失败，请稍后重试');
         }
         const snapshot = await unpackArchive(
            await readArchive(response, attemptSignal), limits,
         );
         attemptSignal.throwIfAborted();
         return snapshot;
      } catch (error) {
         if (mirror) continue;
         throw githubError(
            error instanceof Error && !['TimeoutError', 'TypeError'].includes(error.name)
               ? error.message : '仓库下载失败或超时，请稍后重试',
         );
      }
   }
   throw githubError('仓库下载失败，请稍后重试');
}
