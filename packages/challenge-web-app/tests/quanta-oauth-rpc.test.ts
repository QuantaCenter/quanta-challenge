import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRPCError } from '@trpc/server';
import {
   isQuantaProcedure,
   isQuantaRpcRequest,
   loginError,
   parseAuthorizationResult,
} from '../app/utils/quanta-login.ts';
import { OAuthFailure } from '../server/services/quanta-oauth/core.ts';
import { onboardingInputSchema } from '../server/services/quanta-oauth/inputs.ts';
import {
   oauthErrorKind,
   toOAuthRpcError,
} from '../server/services/quanta-oauth/rpc-errors.ts';

test('OAuth RPC failures preserve safe business codes but never raw upstream exceptions', () => {
   const error = toOAuthRpcError(new OAuthFailure('credentials_invalid', 401));
   assert.ok(error instanceof TRPCError);
   assert.equal(error.code, 'UNAUTHORIZED');
   assert.equal(oauthErrorKind(error), 'credentials_invalid');
   assert.equal(
      toOAuthRpcError(new OAuthFailure('csrf_failed', 403)).code,
      'FORBIDDEN',
   );
   assert.equal(
      toOAuthRpcError(new OAuthFailure('too_many_requests', 429)).code,
      'TOO_MANY_REQUESTS',
   );
   const unknown = toOAuthRpcError(new Error('private provider credentials'));
   assert.equal(oauthErrorKind(unknown), 'unavailable');
   assert.doesNotMatch(JSON.stringify(unknown), /private provider credentials/);
   assert.equal(
      oauthErrorKind(new TRPCError({ code: 'BAD_REQUEST' })),
      undefined,
   );
});

test('onboarding mutations require their own valid CSRF proof and action-specific input', () => {
   const csrfToken = 'c'.repeat(43);
   assert.deepEqual(
      onboardingInputSchema.parse({ action: 'create', csrfToken }),
      { action: 'create', csrfToken },
   );
   assert.equal(
      onboardingInputSchema.parse({
         action: 'verify',
         csrfToken,
         email: 'member@example.test',
         password: 'original-password',
      }).action,
      'verify',
   );
   for (const input of [
      { action: 'create' },
      { action: 'create', csrfToken: 'bad' },
      { action: 'link', csrfToken, userId: 'caller-selected-victim' },
      { action: 'verify', csrfToken, email: 'invalid', password: 'secret' },
      {
         action: 'verify',
         csrfToken,
         email: 'member@example.test',
         password: '',
      },
   ])
      assert.equal(onboardingInputSchema.safeParse(input).success, false);
});

test('only exact OAuth procedures and requests opt out of generic batching and retries', () => {
   for (const path of [
      'auth.quanta.start',
      'auth.quanta.context',
      'auth.quanta.onboarding',
      'auth.quanta.session',
   ])
      assert.equal(isQuantaProcedure(path), true);
   for (const path of [
      'auth.login.email',
      'auth.quantaElse.start',
      'protected.quanta.start',
      'auth.quanta',
   ])
      assert.equal(isQuantaProcedure(path), false);
   assert.equal(
      isQuantaRpcRequest(
         'https://challenge.quantacenter.com/api/trpc/auth.quanta.onboarding',
      ),
      true,
   );
   assert.equal(
      isQuantaRpcRequest('/api/trpc/auth.quanta.context?input=undefined'),
      true,
   );
   assert.equal(isQuantaRpcRequest('/api/trpc/auth.login.email'), false);
   assert.equal(
      isQuantaRpcRequest('/api/trpc/auth.login.email?next=auth.quanta.start'),
      false,
   );
});

test('authorization response cannot navigate away from the trusted issuer and callback', () => {
   const issuer = 'https://www.quantacenter.com';
   const origin = 'https://challenge.quantacenter.com';
   const url = new URL('/oauth2/authorize', issuer);
   for (const [key, value] of Object.entries({
      response_type: 'code',
      client_id: 'quanta-challenge',
      redirect_uri: `${origin}/api/auth/quanta/callback`,
      scope: 'openid profile',
      state: 's'.repeat(43),
      nonce: 'n'.repeat(43),
      code_challenge: 'c'.repeat(43),
      code_challenge_method: 'S256',
   }))
      url.searchParams.set(key, value);
   const result = { authorizationUrl: url.href, issuer };
   assert.equal(parseAuthorizationResult(result, origin), url.href);
   for (const invalid of [
      { ...result, authorizationUrl: 'https://evil.test/' },
      { ...result, issuer: 'http://www.quantacenter.com' },
      {
         ...result,
         authorizationUrl: url.href.replace('/oauth2/authorize', '/other'),
      },
      {
         ...result,
         authorizationUrl: url.href.replace(
            'client_id=quanta-challenge',
            'client_id=other',
         ),
      },
      {
         ...result,
         authorizationUrl: url.href.replace(
            'code_challenge_method=S256',
            'code_challenge_method=plain',
         ),
      },
   ])
      assert.throws(() => parseAuthorizationResult(invalid, origin));
});

test('typed tRPC failure metadata is rendered locally without echoing exception messages', () => {
   const result = loginError({
      data: { quantaOAuthError: 'credentials_invalid' },
      message: 'private exception',
   });
   assert.equal(result.message, '原账号邮箱或密码不正确。');
   assert.equal(result.restart, false);
   assert.equal(
      loginError({ data: { quantaOAuthError: 'expired' } }).restart,
      true,
   );
   assert.doesNotMatch(
      loginError({ data: { quantaOAuthError: 'unknown-private-text' } })
         .message,
      /unknown-private-text/,
   );
});
