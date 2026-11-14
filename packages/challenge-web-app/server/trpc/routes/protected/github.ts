import z from 'zod';
import prisma from '~~/lib/prisma';
import { router } from '../../trpc';
import { protectedProcedure } from '../../protected-trpc';
import { begin, disconnect, settings, userToken } from '../../../services/github/accounts';
import { api, repositorySummary, type Repository } from '../../../services/github/client';
import { inspectRepository, importRepository } from '../../../services/github/import';
import { useRedis } from '../../../utils/redis';
import { githubError } from '../../../services/github/client';

const page = z.number().int().min(1).max(1000).default(1);
const target = z.object({ target: z.enum(['workshop', 'settings']).default('workshop') });
const repository = z.string().trim().min(1).max(300);
const githubProcedure = protectedProcedure.use(async ({ ctx, next }) => {
   const key = `github:api-limit:${ctx.user.userId}:${Math.floor(Date.now() / 60000)}`;
   const count = await useRedis().incr(key);
   if (count === 1) await useRedis().expire(key, 120);
   if (count > 120) throw githubError('GitHub 操作过于频繁，请稍后重试', 'TOO_MANY_REQUESTS');
   return next();
});
export const githubRouter = router({
   status: protectedProcedure.query(async ({ ctx }) => {
      const row = await prisma.gitHubConnection.findUnique({ where: { userId: ctx.user.userId }, select: { login: true, githubUserId: true, revokedAt: true, accessTokenEncrypted: true } });
      return { enabled: settings().enabled, connected: !!row?.accessTokenEncrypted && !row.revokedAt, login: row?.login ?? null, githubUserId: row?.githubUserId.toString() ?? null };
   }),
   connect: protectedProcedure.input(target).mutation(({ ctx, input }) => begin(ctx.event, ctx.user.userId, input.target)),
   install: protectedProcedure.input(target).mutation(({ ctx, input }) => begin(ctx.event, ctx.user.userId, input.target, true)),
   disconnect: protectedProcedure.mutation(({ ctx }) => disconnect(ctx.user.userId)),
   installations: githubProcedure.input(z.object({ page })).query(async ({ ctx, input }) => {
      const token = await userToken(ctx.user.userId);
      const result = await api<{ installations: { id: number; account: { login: string }; suspended_at: string | null }[] }>(`/user/installations?per_page=100&page=${input.page}`, token);
      return { items: result.installations.filter(i => !i.suspended_at).map(i => ({ id: String(i.id), account: i.account.login })), hasMore: result.installations.length === 100 };
   }),
   repositories: githubProcedure.input(z.object({ installationId: z.string().regex(/^\d+$/), page })).query(async ({ ctx, input }) => {
      const token = await userToken(ctx.user.userId);
      // This user-scoped endpoint checks BOTH the installation's grant and the user's access.
      const result = await api<{ repositories: Repository[] }>(`/user/installations/${input.installationId}/repositories?per_page=100&page=${input.page}`, token);
      return { items: result.repositories.map(repositorySummary), hasMore: result.repositories.length === 100 };
   }),
   inspect: githubProcedure.input(z.object({ repository, page })).query(({ ctx, input }) => inspectRepository(ctx.user.userId, input.repository, input.page)),
   import: githubProcedure.input(z.object({ repository, branch: z.string().min(1).max(255), name: z.string().trim().min(1).max(40) })).mutation(({ ctx, input }) => importRepository(ctx.user.userId, input)),
});
