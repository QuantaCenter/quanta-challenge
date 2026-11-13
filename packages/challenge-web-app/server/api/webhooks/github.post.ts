import { defineEventHandler, getHeader, readRawBody, createError } from 'h3';
import prisma from '~~/lib/prisma';
import { settings, revokedCredentials } from '../../services/github/accounts';
import { validSignature } from '../../services/github/core';

export default defineEventHandler(async event => {
   const body = await readRawBody(event, false);
   if (!body || body.length > 1024 * 1024) throw createError({ statusCode: 413 });
   if (!validSignature(body, getHeader(event, 'x-hub-signature-256') || '', settings().webhookSecret)) throw createError({ statusCode: 401 });
   const payload = JSON.parse(body.toString()) as { action?: string; sender?: { id?: number } };
   if (getHeader(event, 'x-github-event') === 'github_app_authorization' && payload.action === 'revoked' && payload.sender?.id) {
      await prisma.$transaction(async tx => {
         const row = await tx.gitHubConnection.findUnique({ where: { githubUserId: BigInt(payload.sender!.id!) } });
         if (row) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`github:${row.userId}`}, 0))`;
            await tx.gitHubConnection.updateMany({ where: { userId: row.userId, githubUserId: row.githubUserId }, data: revokedCredentials() });
         }
      });
   }
   // All actions are idempotent; repository grants are always queried live.
   return { received: true };
});
