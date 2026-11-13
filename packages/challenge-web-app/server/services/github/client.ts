import { TRPCError } from '@trpc/server';

export const githubError = (message: string, code: 'BAD_REQUEST' | 'FORBIDDEN' | 'UNAUTHORIZED' | 'TOO_MANY_REQUESTS' | 'BAD_GATEWAY' = 'BAD_REQUEST') => new TRPCError({ code, message });

export async function api<T>(path: string, token?: string, signal?: AbortSignal): Promise<T> {
   if (!path.startsWith('/') || path.startsWith('//')) throw githubError('非法 GitHub 请求');
   const response = await fetch(`https://api.github.com${path}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Quanta-Challenge', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      redirect: 'error', signal: signal ?? AbortSignal.timeout(15000),
   });
   if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))) throw githubError('GitHub 请求额度已用尽，请稍后重试；公开仓库匿名访问也有额度限制', 'TOO_MANY_REQUESTS');
      if (response.status === 401) throw githubError('GitHub 授权已失效，请重新连接', 'UNAUTHORIZED');
      if (response.status === 403 || response.status === 429) throw githubError('GitHub 暂时拒绝访问，请检查仓库授权或稍后重试', 'FORBIDDEN');
      if (response.status === 404) throw githubError('仓库不存在或需要 GitHub 授权');
      throw githubError('GitHub 请求失败，请稍后重试', 'BAD_GATEWAY');
   }
   return await response.json() as T;
}

export type Repository = { id: number; name: string; full_name: string; owner: { login: string }; private: boolean; visibility?: string; default_branch: string; description: string | null; archived: boolean };

export const repositorySummary = (repo: Repository) => ({
   id: String(repo.id), name: repo.name, fullName: repo.full_name,
   visibility: repo.visibility ?? (repo.private ? 'private' : 'public'),
   defaultBranch: repo.default_branch, description: repo.description,
});
