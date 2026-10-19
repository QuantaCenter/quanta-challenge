import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { createAccountService } from '../server/services/quanta-oauth/accounts-core.ts';

function fixture(
   options: { bound?: string; race?: string; unique?: boolean } = {},
) {
   const users = new Map(
      ['existing', 'other'].map((id) => [id, { id, role: 'ADMIN', name: id }]),
   );
   let binding = options.bound;
   let created: Record<string, unknown> | undefined;
   let queries = 0;
   const auth = {
      findUnique: async () => {
         queries++;
         return binding ? { userId: binding, user: users.get(binding) } : null;
      },
   };
   const db = {
      auth,
      $transaction: async (task: (tx: unknown) => Promise<unknown>) => {
         const snapshot = new Map(users);
         try {
            return await task({
               auth: {
                  ...auth,
                  create: async ({ data }: { data: { userId: string } }) => {
                     if (options.unique || options.race)
                        throw { code: 'P2002' };
                     binding = data.userId;
                  },
               },
               user: {
                  findUniqueOrThrow: async ({
                     where,
                  }: {
                     where: { id: string };
                  }) => {
                     const user = users.get(where.id);
                     if (!user) throw new Error('missing');
                     return user;
                  },
                  create: async ({
                     data,
                  }: {
                     data: Record<string, unknown>;
                  }) => {
                     created = data;
                     const user = { id: 'new', ...data };
                     users.set('new', user as never);
                     return user;
                  },
               },
            });
         } catch (error) {
            users.clear();
            for (const [id, user] of snapshot) users.set(id, user);
            if (options.race) binding = options.race;
            throw error;
         }
      },
   } as unknown as Pick<PrismaClient, 'auth' | '$transaction'>;
   return {
      service: createAccountService(db),
      created: () => created,
      queries: () => queries,
      users,
   };
}
test('retry returns the existing identity without creating another user or changing role', async () => {
   const f = fixture({ bound: 'existing' });
   assert.equal(
      (await f.service.createOrLink('identity', 'Member')).id,
      'existing',
   );
   assert.equal(
      (await f.service.createOrLink('identity', 'Member', 'existing')).role,
      'ADMIN',
   );
   assert.equal(f.created(), undefined);
   await assert.rejects(
      f.service.createOrLink('identity', 'Member', 'other'),
      /binding_conflict/,
   );
});
test('new accounts are least-privilege with random username, no copied email or password', async () => {
   const f = fixture();
   await f.service.createOrLink('identity', '实名');
   assert.match(String(f.created()?.name), /^q_[A-Za-z0-9_-]{16}$/);
   assert.deepEqual(f.created(), {
      name: f.created()?.name,
      displayName: '实名',
      role: 'USER',
      UserStatistic: { create: {} },
   });
});
test('explicit binding preserves the original local account and creates no new user', async () => {
   const f = fixture();
   const user = await f.service.createOrLink('identity', 'Member', 'existing');
   assert.equal(user.id, 'existing');
   assert.equal(user.role, 'ADMIN');
   assert.equal(f.created(), undefined);
});
test('concurrent exact-identity creation resolves to the winning account after rollback', async () => {
   const f = fixture({ race: 'existing' });
   assert.equal(
      (await f.service.createOrLink('identity', 'Member')).id,
      'existing',
   );
   assert.equal(f.users.has('new'), false);
});
test('a competing binding to another account is never merged or signed in as the target', async () => {
   const f = fixture({ race: 'other' });
   await assert.rejects(
      f.service.createOrLink('identity', 'Member', 'existing'),
      /binding_conflict/,
   );
});
test('a user-side uniqueness conflict cannot recover through an unrelated identity', async () => {
   const f = fixture({ unique: true });
   await assert.rejects(
      f.service.createOrLink('identity', 'Member', 'existing'),
      /binding_conflict/,
   );
   assert.ok(f.queries() >= 2);
});
