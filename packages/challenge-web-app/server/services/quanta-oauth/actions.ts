import type { H3Event } from 'h3';
import prisma from '~~/lib/prisma';
import { comparePassword } from '../../utils/password';
import { createOrLink } from './accounts';
import { OAuthFailure, opaque } from './core';
import {
   assertSameOrigin,
   browser,
   cookie,
   csrf,
   ephemeral,
   HANDOFF,
   limit,
   PENDING,
} from './http';
import type { OnboardingInput, PendingIdentity } from './inputs';
import { authorization, settings } from './provider';
import { establishSession, readSessionHandoff } from './session';

// Precomputed bcrypt cost 10, matching the project's current password policy.
// Missing accounts still perform a comparison to reduce obvious timing differences.
// This is NOT a credential: a real stored password is always required below.
const DUMMY_PASSWORD_HASH =
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export async function startAuthorization(event: H3Event) {
   assertSameOrigin(event);
   await limit(event, 'start', 60);

   const binding = browser(event, true);
   const verifier = opaque();
   const nonce = opaque();
   const state = await ephemeral().issue(
      'state',
      { verifier, nonce },
      binding,
      600,
   );
   const url = await authorization(state.token, verifier, nonce);

   return { authorizationUrl: url.href, issuer: settings().issuer };
}

export async function getLoginContext(event: H3Event) {
   if (getHeader(event, 'sec-fetch-site') !== 'same-origin') {
      throw new OAuthFailure('csrf_failed', 403);
   }

   if (getCookie(event, HANDOFF)) {
      await readSessionHandoff(event);
      return { status: 'ready' as const };
   }

   const record = await ephemeral().read<PendingIdentity>(
      'pending',
      getCookie(event, PENDING) || '',
      browser(event),
   );
   const verified =
      record.payload.verifiedAt &&
      record.payload.verifiedAt + 300000 > Date.now();
   const target =
      verified && record.payload.verifiedUserId
         ? await prisma.user.findUnique({
              where: { id: record.payload.verifiedUserId },
              select: { displayName: true, name: true },
           })
         : null;

   return {
      status: 'onboarding' as const,
      name: record.payload.name,
      csrfToken: record.csrf,
      linkName: target?.displayName || target?.name || null,
   };
}

export async function completeOnboarding(
   event: H3Event,
   input: OnboardingInput,
) {
   await limit(event, 'onboarding', 30);
   const token = getCookie(event, PENDING) || '';
   const store = ephemeral();
   const record = await store.read<PendingIdentity>(
      'pending',
      token,
      browser(event),
   );

   // The pending-flow proof is independent of any previous Challenge session.
   csrf(event, record.csrf, input.csrfToken);

   if (input.action === 'verify') {
      await limit(event, 'password', 10);
      const auth = await prisma.auth.findUnique({
         where: {
            provider_providerId: {
               provider: 'EMAIL',
               providerId: input.email,
            },
         },
      });
      const matches = await comparePassword(
         input.password,
         auth?.password || DUMMY_PASSWORD_HASH,
      );

      // Even a matching dummy hash can never authenticate an absent account.
      if (!auth?.password || !matches) {
         throw new OAuthFailure('credentials_invalid', 401);
      }

      await store.update('pending', token, record, {
         ...record.payload,
         verifiedUserId: auth.userId,
         verifiedAt: Date.now(),
      });
      return { status: 'verified' as const };
   }

   let target: string | undefined;
   if (input.action === 'link') {
      if (
         !record.payload.verifiedUserId ||
         !record.payload.verifiedAt ||
         record.payload.verifiedAt + 300000 <= Date.now()
      ) {
         throw new OAuthFailure('reauth_required', 401);
      }
      target = record.payload.verifiedUserId;
   }

   // Consume the exact confirmed snapshot before permanent database side effects.
   // If finalization fails, the user must restart rather than reuse old proof.
   await store.consumeRecord('pending', token, record);
   const user = await createOrLink(
      record.payload.identityKey,
      record.payload.name,
      target,
   );
   await establishSession(event, user);
   cookie(event, PENDING, '', 0);
   return { status: 'ready' as const };
}
