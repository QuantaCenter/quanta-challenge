import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type Redis from 'ioredis';

export const HOME = '/app/dashboard';
export const opaque = () => randomBytes(32).toString('base64url');
export const digest = (value: string) =>
   createHash('sha256').update(value).digest('hex');
export const isOpaque = (value: unknown): value is string =>
   typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export function sameSecret(left: string, right: string) {
   const a = Buffer.from(left),
      b = Buffer.from(right);
   return a.length === b.length && timingSafeEqual(a, b);
}
export class OAuthFailure extends Error {
   kind: string;
   status: number;
   constructor(kind: string, status = 400) {
      super(kind);
      this.kind = kind;
      this.status = status;
   }
}
export function parseCallback(query: URLSearchParams) {
   const state = query.get('state');
   const code = query.get('code');
   const error = query.get('error');
   if (
      ['state', 'code', 'error', 'iss'].some(
         (key) => query.getAll(key).length > 1,
      ) ||
      !isOpaque(state) ||
      query.has('code') === query.has('error') ||
      (query.has('code') && !code) ||
      (query.has('error') && !error)
   )
      throw new OAuthFailure('invalid_request');
   return { state, error };
}
export function providerIdentityKey(issuer: string, subject: string) {
   // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject ASCII control characters in the upstream subject by design.
   const invalidSubject = /[\x00-\x1f\x7f]/.test(subject);
   if (!subject || subject.length > 255 || invalidSubject)
      throw new OAuthFailure('identity_invalid');
   return JSON.stringify([issuer, subject]);
}
export function validateSettings(env: Record<string, string | undefined>) {
   if (env.QUANTA_OAUTH_ENABLED !== 'true')
      throw new OAuthFailure('not_enabled', 503);
   try {
      const issuer = new URL(env.QUANTA_OAUTH_ISSUER || '');
      const app = new URL(env.QUANTA_OAUTH_APP_ORIGIN || '');
      const secret = env.QUANTA_OAUTH_CLIENT_SECRET || '';
      const clientId = env.QUANTA_OAUTH_CLIENT_ID;
      const localTest = clientId === 'quanta-challenge-local';
      if (
         localTest &&
         (env.NODE_ENV !== 'development' ||
            env.QUANTA_OAUTH_ALLOW_LOCAL_TEST !== 'true' ||
            app.origin !== 'https://localhost:3443' ||
            issuer.href !== 'https://www.quantacenter.com/')
      )
         throw new Error();
      if (
         issuer.protocol !== 'https:' ||
         app.protocol !== 'https:' ||
         issuer.username ||
         issuer.password ||
         issuer.hash ||
         issuer.search ||
         app.username ||
         app.password ||
         app.hash ||
         app.search ||
         app.pathname !== '/' ||
         (!localTest && clientId !== 'quanta-challenge') ||
         secret.length < 32
      )
         throw new Error();
      return {
         issuer: issuer.href.replace(/\/$/, ''),
         appOrigin: app.origin,
         callback: `${app.origin}/api/auth/quanta/callback`,
         clientId: clientId as string,
         clientSecret: secret,
      };
   } catch {
      throw new OAuthFailure('configuration', 503);
   }
}
export interface EphemeralRecord<T> {
   binding: string;
   expiresAt: number;
   csrf: string;
   payload: T;
}
export interface SessionHandoff {
   userId: string;
   csrfToken: string;
}
export function validateHandoff(
   payload: SessionHandoff,
   identity: unknown,
   csrfToken: string,
) {
   if (
      !identity ||
      typeof identity !== 'object' ||
      !('userId' in identity) ||
      !payload.userId ||
      identity.userId !== payload.userId ||
      !isOpaque(payload.csrfToken) ||
      !sameSecret(csrfToken, payload.csrfToken)
   )
      throw new OAuthFailure('session_invalid', 401);
}
export function createEphemeralStore(
   redis: Pick<Redis, 'get' | 'set' | 'eval'>,
   now = () => Date.now(),
) {
   const key = (kind: string, token: string) => {
      if (!isOpaque(token)) throw new OAuthFailure('expired');
      return `quanta_oidc:${kind}:${digest(token)}`;
   };
   async function read<T>(
      kind: string,
      token: string,
      binding: string,
   ): Promise<EphemeralRecord<T>> {
      if (!isOpaque(binding)) throw new OAuthFailure('expired');
      const raw = await redis.get(key(kind, token));
      if (!raw) throw new OAuthFailure('expired');
      let record: EphemeralRecord<T>;
      try {
         record = JSON.parse(raw);
      } catch {
         throw new OAuthFailure('expired');
      }
      if (
         !record ||
         !sameSecret(record.binding || '', digest(binding)) ||
         !Number.isFinite(record.expiresAt) ||
         record.expiresAt <= now() ||
         !isOpaque(record.csrf) ||
         !record.payload
      )
         throw new OAuthFailure('expired');
      return record;
   }
   async function consumeRecord<T>(
      kind: string,
      token: string,
      record: EphemeralRecord<T>,
   ) {
      if (!Number.isFinite(record.expiresAt) || record.expiresAt <= now())
         throw new OAuthFailure('expired');
      const result = await redis.eval(
         "if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('DEL',KEYS[1]); return 1 else return 0 end",
         1,
         key(kind, token),
         JSON.stringify(record),
      );
      if (result !== 1) throw new OAuthFailure('expired');
      return record;
   }
   return {
      async issue<T>(
         kind: string,
         payload: T,
         binding: string,
         seconds: number,
      ) {
         if (!isOpaque(binding)) throw new OAuthFailure('expired');
         const token = opaque();
         const record = {
            binding: digest(binding),
            expiresAt: now() + seconds * 1000,
            csrf: opaque(),
            payload,
         };
         const result = await redis.set(
            key(kind, token),
            JSON.stringify(record),
            'EX',
            seconds,
            'NX',
         );
         if (result !== 'OK') throw new OAuthFailure('unavailable', 503);
         return { token, record };
      },
      read,
      consumeRecord,
      async update<T>(
         kind: string,
         token: string,
         record: EphemeralRecord<T>,
         payload: T,
      ) {
         const next = { ...record, payload };
         const result = await redis.eval(
            "if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'KEEPTTL'); return 1 else return 0 end",
            1,
            key(kind, token),
            JSON.stringify(record),
            JSON.stringify(next),
         );
         if (result !== 1) throw new OAuthFailure('conflict', 409);
         return next;
      },
      async consume<T>(kind: string, token: string, binding: string) {
         const record = await read<T>(kind, token, binding);
         return consumeRecord(kind, token, record);
      },
   };
}
