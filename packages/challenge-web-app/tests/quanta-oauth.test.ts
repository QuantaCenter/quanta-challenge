import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import type Redis from 'ioredis';
import {
   createEphemeralStore,
   digest,
   HOME,
   isOpaque,
   opaque,
   parseCallback,
   providerIdentityKey,
   validateHandoff,
   validateSettings,
} from '../server/services/quanta-oauth/core.ts';
import {
   discoverProvider,
   exchangeWithProvider,
} from '../server/services/quanta-oauth/provider.ts';

test('OAuth always finishes at Challenge home, not an arbitrary query return URL', () => {
   assert.equal(HOME, '/app/dashboard');
});
test('identity key includes issuer and opaque subject without ambiguous concatenation', () => {
   assert.notEqual(
      providerIdentityKey('https://a.test', '1'),
      providerIdentityKey('https://b.test', '1'),
   );
   assert.throws(() => providerIdentityKey('https://a.test', ''));
   assert.throws(() => providerIdentityKey('https://a.test', 'a'.repeat(256)));
});
test('only high-entropy opaque transaction formats are accepted', () => {
   assert.equal(isOpaque('a'.repeat(43)), true);
   for (const value of ['', '../x', 'x'.repeat(200), 'x?y', null])
      assert.equal(isOpaque(value), false);
});
test('disabled service never falls back to insecure credentials', () => {
   assert.throws(() => validateSettings({}), /not_enabled/);
   assert.throws(
      () => validateSettings({ QUANTA_OAUTH_ENABLED: 'true' }),
      /configuration/,
   );
});
test('configuration pins HTTPS issuer, client and exact callback; no arbitrary host', () => {
   const config = {
      QUANTA_OAUTH_ENABLED: 'true',
      QUANTA_OAUTH_ISSUER: 'https://www.quantacenter.com',
      QUANTA_OAUTH_CLIENT_ID: 'quanta-challenge',
      QUANTA_OAUTH_CLIENT_SECRET: 's'.repeat(40),
      QUANTA_OAUTH_APP_ORIGIN: 'https://challenge.quantacenter.com',
   };
   assert.equal(
      validateSettings(config).callback,
      'https://challenge.quantacenter.com/api/auth/quanta/callback',
   );
   for (const bad of [
      { QUANTA_OAUTH_ISSUER: 'http://www.quantacenter.com' },
      { QUANTA_OAUTH_APP_ORIGIN: 'https://challenge.quantacenter.com/evil' },
      { QUANTA_OAUTH_CLIENT_ID: 'another' },
   ])
      assert.throws(() => validateSettings({ ...config, ...bad }));
});

test('local test client requires development opt-in and the exact localhost origin', () => {
   const local = {
      NODE_ENV: 'development',
      QUANTA_OAUTH_ENABLED: 'true',
      QUANTA_OAUTH_ALLOW_LOCAL_TEST: 'true',
      QUANTA_OAUTH_ISSUER: 'https://www.quantacenter.com',
      QUANTA_OAUTH_CLIENT_ID: 'quanta-challenge-local',
      QUANTA_OAUTH_CLIENT_SECRET: 's'.repeat(40),
      QUANTA_OAUTH_APP_ORIGIN: 'https://localhost:3443',
   };
   assert.equal(validateSettings(local).clientId, 'quanta-challenge-local');
   assert.equal(
      validateSettings(local).callback,
      'https://localhost:3443/api/auth/quanta/callback',
   );
   for (const bad of [
      { NODE_ENV: 'production' },
      { NODE_ENV: undefined },
      { QUANTA_OAUTH_ALLOW_LOCAL_TEST: 'false' },
      { QUANTA_OAUTH_APP_ORIGIN: 'https://localhost:3444' },
      { QUANTA_OAUTH_APP_ORIGIN: 'https://127.0.0.1:3443' },
      { QUANTA_OAUTH_APP_ORIGIN: 'https://localhost.evil.test:3443' },
      { QUANTA_OAUTH_APP_ORIGIN: 'http://localhost:3443' },
      { QUANTA_OAUTH_ISSUER: 'https://untrusted.test' },
      { QUANTA_OAUTH_CLIENT_ID: 'arbitrary-client' },
   ])
      assert.throws(
         () => validateSettings({ ...local, ...bad }),
         /configuration/,
      );
});

function memoryStore() {
   const values = new Map<string, string>();
   const redis = {
      get: async (key: string) => values.get(key) || null,
      set: async (key: string, value: string) => {
         if (values.has(key)) return null;
         values.set(key, value);
         return 'OK';
      },
      eval: async (
         script: string,
         _count: number,
         key: string,
         expected: string,
         replacement?: string,
      ) => {
         if (values.get(key) !== expected) return 0;
         if (script.includes('KEEPTTL')) values.set(key, replacement!);
         else values.delete(key);
         return 1;
      },
   } as unknown as Pick<Redis, 'get' | 'set' | 'eval'>;
   let time = 1000;
   return {
      store: createEphemeralStore(redis, () => time),
      advance: (ms: number) => {
         time += ms;
      },
      values,
   };
}
test('state is bound to the browser; a mismatch cannot consume another browser transaction', async () => {
   const { store } = memoryStore();
   const browser = opaque();
   const issued = await store.issue('state', { nonce: opaque() }, browser, 60);
   await assert.rejects(
      store.consume('state', issued.token, opaque()),
      /expired/,
   );
   const result = await store.consume<{ nonce: string }>(
      'state',
      issued.token,
      browser,
   );
   assert.equal(result.payload.nonce, issued.record.payload.nonce);
   await assert.rejects(
      store.consume('state', issued.token, browser),
      /expired/,
   );
});
test('expiry is enforced even if stale Redis data remains', async () => {
   const { store, advance } = memoryStore();
   const browser = opaque();
   const issued = await store.issue('pending', { name: 'Member' }, browser, 60);
   advance(60001);
   await assert.rejects(
      store.read('pending', issued.token, browser),
      /expired/,
   );
});
test('concurrent callbacks can only consume state once', async () => {
   const { store } = memoryStore();
   const browser = opaque();
   const issued = await store.issue(
      'state',
      { verifier: opaque() },
      browser,
      60,
   );
   const results = await Promise.allSettled([
      store.consume('state', issued.token, browser),
      store.consume('state', issued.token, browser),
   ]);
   assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
   );
});
test('keys and browser bindings are hashed and pending updates reject stale versions', async () => {
   const { store, values } = memoryStore();
   const browser = opaque();
   const issued = await store.issue('pending', { name: 'Member' }, browser, 60);
   assert.equal(
      [...values.keys()][0],
      `quanta_oidc:pending:${digest(issued.token)}`,
   );
   assert.notEqual(issued.record.binding, browser);
   await store.update('pending', issued.token, issued.record, {
      name: 'Verified',
   });
   await assert.rejects(
      store.update('pending', issued.token, issued.record, { name: 'Stale' }),
      /conflict/,
   );
});

test('finalization consumes the exact confirmed snapshot, not a later verification', async () => {
   const { store } = memoryStore();
   const browser = opaque();
   const issued = await store.issue(
      'pending',
      { verifiedUserId: 'first' },
      browser,
      60,
   );
   const next = await store.update('pending', issued.token, issued.record, {
      verifiedUserId: 'second',
   });
   await assert.rejects(
      store.consumeRecord('pending', issued.token, issued.record),
      /expired/,
   );
   assert.deepEqual(
      (await store.consumeRecord('pending', issued.token, next)).payload,
      { verifiedUserId: 'second' },
   );
   await assert.rejects(
      store.consumeRecord('pending', issued.token, next),
      /expired/,
   );
});
test('confirmed snapshots cannot be finalized after expiration', async () => {
   const { store, advance } = memoryStore();
   const browser = opaque();
   const issued = await store.issue('pending', { name: 'Member' }, browser, 60);
   advance(60001);
   await assert.rejects(
      store.consumeRecord('pending', issued.token, issued.record),
      /expired/,
   );
});
test('callback requires a single opaque state and exactly one code or error', () => {
   const state = opaque();
   assert.deepEqual(
      parseCallback(new URLSearchParams({ state, code: 'authorization-code' })),
      { state, error: null },
   );
   assert.deepEqual(
      parseCallback(
         new URLSearchParams({
            state,
            error: 'access_denied',
            error_description: 'Cancelled',
         }),
      ),
      { state, error: 'access_denied' },
   );
   for (const query of [
      `state=${state}`,
      `state=${state}&code=`,
      `state=${state}&error=`,
      `state=${state}&code=x&error=access_denied`,
      `state=${state}&code=x&code=y`,
      `state=${state}&state=${state}&code=x`,
      `state=bad&code=x`,
      `state=${state}&code=x&iss=a&iss=b`,
   ])
      assert.throws(
         () => parseCallback(new URLSearchParams(query)),
         /invalid_request/,
      );
});
test('handoff must match both current Challenge identity and CSRF; an old account session cannot substitute', () => {
   const csrfToken = opaque();
   const payload = { userId: 'oauth-user', csrfToken };
   validateHandoff(payload, { userId: 'oauth-user' }, csrfToken);
   for (const identity of [{ userId: 'previous-user' }, null, 'jwt', {}])
      assert.throws(
         () => validateHandoff(payload, identity, csrfToken),
         /session_invalid/,
      );
   assert.throws(
      () => validateHandoff(payload, { userId: 'oauth-user' }, opaque()),
      /session_invalid/,
   );
   assert.throws(
      () =>
         validateHandoff(
            { userId: 'oauth-user', csrfToken: '' },
            { userId: 'oauth-user' },
            '',
         ),
      /session_invalid/,
   );
});

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const issuer = 'https://www.quantacenter.com';
const config = {
   issuer,
   appOrigin: 'https://challenge.quantacenter.com',
   callback: 'https://challenge.quantacenter.com/api/auth/quanta/callback',
   clientId: 'quanta-challenge',
   clientSecret: 's'.repeat(40),
};
async function fakeProvider(
   patch: Record<string, unknown> = {},
   corrupt = false,
) {
   let tokenRequests = 0;
   const request: typeof fetch = async (input, init) => {
      const url = String(input);
      let data: unknown;
      if (url.endsWith('/.well-known/openid-configuration'))
         data = {
            issuer,
            authorization_endpoint: `${issuer}/oauth2/authorize`,
            token_endpoint: `${issuer}/oauth2/token`,
            jwks_uri: `${issuer}/oauth2/jwks`,
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            code_challenge_methods_supported: ['S256'],
         };
      else if (url.endsWith('/oauth2/jwks'))
         data = {
            keys: [
               {
                  ...keys.publicKey.export({ format: 'jwk' }),
                  kid: 'test-key',
                  alg: 'RS256',
                  use: 'sig',
               },
            ],
         };
      else if (url.endsWith('/oauth2/token')) {
         tokenRequests++;
         assert.equal(
            new URLSearchParams(String(init?.body)).get('code_verifier'),
            'v'.repeat(43),
         );
         assert.ok(
            new Headers(init?.headers)
               .get('authorization')
               ?.startsWith('Basic '),
         );
         const header = Buffer.from(
            JSON.stringify({ alg: 'RS256', kid: 'test-key' }),
         ).toString('base64url');
         const claims = Buffer.from(
            JSON.stringify({
               iss: issuer,
               sub: 'stable-member',
               aud: config.clientId,
               iat: Math.floor(Date.now() / 1000),
               exp: Math.floor(Date.now() / 1000) + 300,
               nonce: 'n'.repeat(43),
               quanta_member: true,
               name: '实名同学',
               ...patch,
            }),
         ).toString('base64url');
         const payload = `${header}.${claims}`;
         const signature = sign(
            'RSA-SHA256',
            Buffer.from(payload),
            keys.privateKey,
         ).toString('base64url');
         data = {
            access_token: 'never-copied-to-Challenge',
            token_type: 'Bearer',
            expires_in: 300,
            id_token: `${payload}.${corrupt ? 'a'.repeat(signature.length) : signature}`,
         };
      } else throw new Error('Unexpected endpoint');
      return new Response(JSON.stringify(data), {
         headers: { 'content-type': 'application/json' },
      });
   };
   return {
      client: await discoverProvider(config, request),
      requests: () => tokenRequests,
   };
}
test('real OIDC client verifies a signed member identity and transmits server-side PKCE', async () => {
   const provider = await fakeProvider();
   const result = await exchangeWithProvider(
      provider.client,
      new URL(`${config.callback}?code=one-time&state=state`),
      'state',
      'v'.repeat(43),
      'n'.repeat(43),
      issuer,
   );
   assert.deepEqual(result, {
      identityKey: JSON.stringify([issuer, 'stable-member']),
      name: '实名同学',
   });
   assert.equal(provider.requests(), 1);
   assert.equal('accessToken' in result, false);
});
for (const [label, patch] of Object.entries({
   nonce: { nonce: 'wrong' },
   audience: { aud: 'wrong-client' },
   issuer: { iss: 'https://evil.test' },
   expiry: { exp: 1 },
   membership: { quanta_member: false },
   'string membership': { quanta_member: 'true' },
   'admin without membership': {
      quanta_member: false,
      role: 'CEO',
      admin: true,
   },
})) {
   test(`real OIDC client rejects ${label} mismatch`, async () => {
      const provider = await fakeProvider(patch);
      await assert.rejects(
         exchangeWithProvider(
            provider.client,
            new URL(`${config.callback}?code=one-time&state=state`),
            'state',
            'v'.repeat(43),
            'n'.repeat(43),
            issuer,
         ),
      );
   });
}
test('signature verification is required even though tokens were received over HTTPS', async () => {
   const provider = await fakeProvider({}, true);
   await assert.rejects(
      exchangeWithProvider(
         provider.client,
         new URL(`${config.callback}?code=x&state=state`),
         'state',
         'v'.repeat(43),
         'n'.repeat(43),
         issuer,
      ),
   );
});
test('state mismatch never reaches token exchange', async () => {
   const provider = await fakeProvider();
   await assert.rejects(
      exchangeWithProvider(
         provider.client,
         new URL(`${config.callback}?code=x&state=attacker`),
         'expected',
         'v'.repeat(43),
         'n'.repeat(43),
         issuer,
      ),
   );
   assert.equal(provider.requests(), 0);
});
