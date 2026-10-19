import { findBinding } from '../../../services/quanta-oauth/accounts';
import {
   OAuthFailure,
   parseCallback,
} from '../../../services/quanta-oauth/core';
import {
   BROWSER,
   browser,
   cookie,
   ephemeral,
   guarded,
   HANDOFF,
   limit,
   PENDING,
} from '../../../services/quanta-oauth/http';
import { exchange, settings } from '../../../services/quanta-oauth/provider';
import { establishSession } from '../../../services/quanta-oauth/session';

export default defineEventHandler((event) =>
   guarded(
      event,
      async () => {
         await limit(event, 'callback', 120);
         const query = getRequestURL(event).searchParams;
         const { state, error } = parseCallback(query);
         const binding = browser(event);
         const record = await ephemeral().consume<{
            verifier: string;
            nonce: string;
         }>('state', state, binding);
         if (error)
            throw new OAuthFailure(
               error === 'access_denied' ? 'access_denied' : 'unavailable',
            );
         const url = new URL(settings().callback);
         url.search = query.toString();
         const identity = await exchange(
            url,
            state,
            record.payload.verifier,
            record.payload.nonce,
         );
         const bound = await findBinding(identity.identityKey);
         // Extend only the browser binding, not the original authorization transaction.
         cookie(event, BROWSER, binding);
         if (bound) {
            cookie(event, PENDING, '', 0);
            await establishSession(event, bound.user);
         } else {
            cookie(event, HANDOFF, '', 0);
            const pending = await ephemeral().issue(
               'pending',
               identity,
               binding,
               300,
            );
            cookie(event, PENDING, pending.token, 300);
         }
         return sendRedirect(event, '/auth/quanta', 303);
      },
      true,
   ),
);
