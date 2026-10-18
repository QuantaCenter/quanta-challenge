import { guarded, ephemeral, browser, PENDING, HANDOFF } from '../../../services/quanta-oauth/http';
import prisma from '~~/lib/prisma';
import { OAuthFailure } from '../../../services/quanta-oauth/core';
import { readSessionHandoff } from '../../../services/quanta-oauth/session';
export interface PendingIdentity { identityKey: string; name: string; verifiedUserId?: string; verifiedAt?: number }

export default defineEventHandler(event => guarded(event, async () => {
   if (getHeader(event, 'sec-fetch-site') !== 'same-origin') throw new OAuthFailure('csrf_failed', 403);
   if (getCookie(event, HANDOFF)) { await readSessionHandoff(event); return { status: 'ready' as const }; }
   const record = await ephemeral().read<PendingIdentity>('pending', getCookie(event, PENDING) || '', browser(event));
   const verified = record.payload.verifiedAt && record.payload.verifiedAt + 300000 > Date.now();
   const target = verified && record.payload.verifiedUserId ? await prisma.user.findUnique({ where: { id: record.payload.verifiedUserId }, select: { displayName: true, name: true } }) : null;
   return { status: 'onboarding' as const, name: record.payload.name, csrfToken: record.csrf, linkName: target?.displayName || target?.name || null };
}));
