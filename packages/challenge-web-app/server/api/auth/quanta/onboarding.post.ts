import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { comparePassword } from '../../../utils/password';
import { OAuthFailure } from '../../../services/quanta-oauth/core';
import { browser, cookie, csrf, ephemeral, guarded, limit, PENDING } from '../../../services/quanta-oauth/http';
import { createOrLink } from '../../../services/quanta-oauth/accounts';
import { establishSession } from '../../../services/quanta-oauth/session';
import type { PendingIdentity } from './context.get';

const input = z.discriminatedUnion('action', [
   z.object({ action: z.literal('create') }),
   z.object({ action: z.literal('verify'), email: z.email().max(254), password: z.string().min(1).max(200) }),
   z.object({ action: z.literal('link') }),
]);
const DUMMY_PASSWORD_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
export default defineEventHandler(event => guarded(event, async () => {
   await limit(event, 'onboarding', 30);
   const token = getCookie(event, PENDING) || '';
   const store = ephemeral();
   const record = await store.read<PendingIdentity>('pending', token, browser(event));
   csrf(event, record.csrf);
   const parsed = input.safeParse(await readBody(event));
   if (!parsed.success) throw new OAuthFailure('invalid_request');
   const data = parsed.data;
   if (data.action === 'verify') {
      await limit(event, 'password', 10);
      const auth = await prisma.auth.findUnique({ where: { provider_providerId: { provider: 'EMAIL', providerId: data.email } } });
      // Same response for absent email and wrong password. No automatic email linking.
      const matches = await comparePassword(data.password, auth?.password || DUMMY_PASSWORD_HASH);
      if (!auth?.password || !matches) throw new OAuthFailure('credentials_invalid', 401);
      await store.update('pending', token, record, { ...record.payload, verifiedUserId: auth.userId, verifiedAt: Date.now() });
      return { status: 'verified' as const };
   }
   let target: string | undefined;
   if (data.action === 'link') {
      if (!record.payload.verifiedUserId || !record.payload.verifiedAt || record.payload.verifiedAt + 300000 <= Date.now()) throw new OAuthFailure('reauth_required', 401);
      target = record.payload.verifiedUserId;
   }
   // Claim precisely the confirmation snapshot before any permanent side effect.
   // If DB/session creation fails, restart authorization; never reuse a consumed proof.
   await store.consumeRecord('pending', token, record);
   const user = await createOrLink(record.payload.identityKey, record.payload.name, target);
   await establishSession(event, user);
   cookie(event, PENDING, '', 0);
   return { status: 'ready' as const };
}));
