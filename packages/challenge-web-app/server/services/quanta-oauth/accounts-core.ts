import type { PrismaClient } from '@prisma/client';
import { OAuthFailure, opaque } from './core.ts';

/** Injectable database boundary; tests exercise the same transaction as production. */
export function createAccountService(
   db: Pick<PrismaClient, 'auth' | '$transaction'>,
) {
   const findBinding = (identityKey: string) =>
      db.auth.findUnique({
         where: {
            provider_providerId: {
               provider: 'QUANTA',
               providerId: identityKey,
            },
         },
         include: { user: true },
      });
   async function createOrLink(
      identityKey: string,
      name: string,
      targetUserId?: string,
   ) {
      try {
         return await db.$transaction(async (tx) => {
            const bound = await tx.auth.findUnique({
               where: {
                  provider_providerId: {
                     provider: 'QUANTA',
                     providerId: identityKey,
                  },
               },
               include: { user: true },
            });
            if (bound) {
               if (targetUserId && bound.userId !== targetUserId)
                  throw new OAuthFailure('binding_conflict', 409);
               return bound.user;
            }
            const user = targetUserId
               ? await tx.user.findUniqueOrThrow({
                    where: { id: targetUserId },
                 })
               : await tx.user.create({
                    data: {
                       name: `q_${opaque().slice(0, 16)}`,
                       displayName: name,
                       role: 'USER',
                       UserStatistic: { create: {} },
                    },
                 });
            await tx.auth.create({
               data: {
                  provider: 'QUANTA',
                  providerId: identityKey,
                  userId: user.id,
               },
            });
            return user;
         });
      } catch (error) {
         if (
            typeof error === 'object' &&
            error &&
            'code' in error &&
            error.code === 'P2002'
         ) {
            // A concurrent authorization may have won the identity insert. Never
            // recover by email, name, or another identity bound to the target user.
            const bound = await findBinding(identityKey);
            if (bound && (!targetUserId || bound.userId === targetUserId))
               return bound.user;
            throw new OAuthFailure('binding_conflict', 409);
         }
         throw error;
      }
   }
   return { findBinding, createOrLink };
}
