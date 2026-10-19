import * as oidc from 'openid-client';
import { OAuthFailure, providerIdentityKey, validateSettings } from './core.ts';

export const settings = () => validateSettings(process.env);
let discovery: Promise<oidc.Configuration> | undefined;
let configuredKey = '';
export async function discoverProvider(
   config: ReturnType<typeof settings>,
   transport: typeof fetch = fetch,
) {
   const client = await oidc.discovery(
      new URL(config.issuer),
      config.clientId,
      { id_token_signed_response_alg: 'RS256' },
      oidc.ClientSecretBasic(config.clientSecret),
      {
         timeout: 10,
         execute: [oidc.enableNonRepudiationChecks],
         [oidc.customFetch]: transport,
      },
   );
   const metadata = client.serverMetadata();
   for (const endpoint of [
      metadata.authorization_endpoint,
      metadata.token_endpoint,
      metadata.jwks_uri,
   ]) {
      if (
         !endpoint ||
         new URL(endpoint).origin !== new URL(config.issuer).origin
      )
         throw new OAuthFailure('configuration', 503);
   }
   if (!metadata.code_challenge_methods_supported?.includes('S256'))
      throw new OAuthFailure('configuration', 503);
   return client;
}
export async function provider() {
   const config = settings();
   const cacheKey = JSON.stringify([
      config.issuer,
      config.clientId,
      config.clientSecret,
   ]);
   if (!discovery || configuredKey !== cacheKey) {
      configuredKey = cacheKey;
      discovery = discoverProvider(config).catch((error) => {
         discovery = undefined;
         throw error;
      });
   }
   return discovery;
}
export async function authorization(
   state: string,
   verifier: string,
   nonce: string,
) {
   return oidc.buildAuthorizationUrl(await provider(), {
      response_type: 'code',
      redirect_uri: settings().callback,
      scope: 'openid profile',
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
   });
}
export async function exchange(
   url: URL,
   state: string,
   verifier: string,
   nonce: string,
) {
   return exchangeWithProvider(
      await provider(),
      url,
      state,
      verifier,
      nonce,
      settings().issuer,
   );
}
export async function exchangeWithProvider(
   client: oidc.Configuration,
   url: URL,
   state: string,
   verifier: string,
   nonce: string,
   issuer: string,
) {
   const tokens = await oidc.authorizationCodeGrant(client, url, {
      expectedState: state,
      pkceCodeVerifier: verifier,
      expectedNonce: nonce,
      idTokenExpected: true,
   });
   const claims = tokens.claims();
   if (claims?.quanta_member !== true || typeof claims.sub !== 'string')
      throw new OAuthFailure('member_required', 403);
   const identityKey = providerIdentityKey(issuer, claims.sub);
   // No upstream token is persisted or copied into the Challenge session.
   return {
      identityKey,
      name:
         typeof claims.name === 'string' && claims.name.trim()
            ? claims.name.trim().slice(0, 100)
            : 'Quanta 塔员',
   };
}
