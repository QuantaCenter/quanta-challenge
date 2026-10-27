import type { User } from '@prisma/client';
import type { H3Event } from 'h3';
import { generateTokens, verifyToken } from '../../utils/jwt';
import { identityCookieOptions } from '../../utils/auth-cookies';
import type { SessionHandoff } from './core';
import { HOME, OAuthFailure, opaque, validateHandoff } from './core';
import { browser, cookie, ephemeral, HANDOFF } from './http';

export async function establishSession(
   event: H3Event,
   user: Pick<User, 'id' | 'role'>,
) {
   const csrfToken = opaque();
   const tokens = generateTokens({ userId: user.id, role: user.role });
   const handoff = await ephemeral().issue(
      'handoff',
      { userId: user.id, csrfToken },
      browser(event),
      60,
   );
   // OAuth 通道恒为 https，secure 保持 true
   const refreshOpt = identityCookieOptions(tokens.refreshToken, true);
   setCookie(event, 'quanta_access_token', tokens.accessToken, identityCookieOptions(tokens.accessToken, true));
   setCookie(event, 'quanta_refresh_token', tokens.refreshToken, refreshOpt);
   setCookie(event, 'quanta_csrf_token', csrfToken, refreshOpt);
   cookie(event, HANDOFF, handoff.token, 60);
}
export async function readSessionHandoff(event: H3Event) {
   if (getHeader(event, 'sec-fetch-site') !== 'same-origin')
      throw new OAuthFailure('csrf_failed', 403);
   const token = getCookie(event, HANDOFF) || '';
   const store = ephemeral();
   const record = await store.read<SessionHandoff>(
      'handoff',
      token,
      browser(event),
   );
   let identity: unknown;
   try {
      identity = verifyToken(getCookie(event, 'quanta_access_token') || '');
   } catch {
      throw new OAuthFailure('session_invalid', 401);
   }
   validateHandoff(
      record.payload,
      identity,
      getCookie(event, 'quanta_csrf_token') || '',
   );
   return { token, store, record };
}
export async function bootstrap(event: H3Event) {
   const { token, store, record } = await readSessionHandoff(event);
   await store.consumeRecord('handoff', token, record);
   cookie(event, HANDOFF, '', 0);
   return { csrfToken: record.payload.csrfToken, destination: HOME };
}
