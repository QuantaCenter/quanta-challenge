import type { H3Event } from 'h3';
import { useRedis } from '../../utils/redis';
import {
   createEphemeralStore,
   digest,
   isOpaque,
   OAuthFailure,
   opaque,
   sameSecret,
} from './core';
import { settings } from './provider';
import { toOAuthRpcError } from './rpc-errors';

export const BROWSER = '__Host-quanta_oidc_browser';
export const PENDING = '__Host-quanta_oidc_pending';
export const HANDOFF = '__Host-quanta_oidc_handoff';
export const ephemeral = () => createEphemeralStore(useRedis());
export function cookie(
   event: H3Event,
   name: string,
   token: string,
   maxAge = 600,
) {
   // __Host- prevents sibling domains from tossing a parent-domain binding cookie.
   setCookie(event, name, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge,
   });
}
export function browser(event: H3Event, create = false) {
   let value = getCookie(event, BROWSER);
   if (!isOpaque(value)) {
      if (!create) throw new OAuthFailure('expired');
      value = opaque();
   }
   if (create) cookie(event, BROWSER, value);
   return value;
}
export function assertSameOrigin(event: H3Event) {
   if (getHeader(event, 'origin') !== settings().appOrigin)
      throw new OAuthFailure('csrf_failed', 403);
}
export function csrf(event: H3Event, expected: string, provided: string) {
   assertSameOrigin(event);
   if (!isOpaque(provided) || !sameSecret(provided, expected))
      throw new OAuthFailure('csrf_failed', 403);
}
export async function limit(event: H3Event, kind: string, maximum: number) {
   const address = event.node.req.socket.remoteAddress || 'unknown';
   const key = `quanta_oidc:limit:${kind}:${digest(address)}:${Math.floor(Date.now() / 60000)}`;
   const count = await useRedis().incr(key);
   if (count === 1) await useRedis().expire(key, 120);
   if (count > maximum) throw new OAuthFailure('too_many_requests', 429);
}
export function setOAuthHeaders(event: H3Event) {
   setHeader(event, 'cache-control', 'no-store');
   setHeader(event, 'referrer-policy', 'no-referrer');
   setHeader(event, 'x-frame-options', 'DENY');
}
export async function guardedRpc<T>(event: H3Event, task: () => Promise<T>) {
   setOAuthHeaders(event);
   try {
      settings();
      return await task();
   } catch (error) {
      throw toOAuthRpcError(error);
   }
}
export async function guarded<T>(
   event: H3Event,
   task: () => Promise<T>,
   redirectErrors = false,
) {
   setOAuthHeaders(event);
   try {
      settings();
      return await task();
   } catch (error) {
      const failure =
         error instanceof OAuthFailure
            ? error
            : new OAuthFailure('unavailable', 503);
      if (redirectErrors)
         return sendRedirect(
            event,
            `/auth/quanta?error=${encodeURIComponent(failure.kind)}`,
            303,
         );
      throw createError({
         statusCode: failure.status,
         statusMessage: 'Quanta login could not be completed',
         data: { error: failure.kind },
      });
   }
}
