import { TRPCError } from '@trpc/server';
import { OAuthFailure } from './core.ts';

const knownErrors = new Set([
   'not_enabled',
   'configuration',
   'expired',
   'access_denied',
   'member_required',
   'unavailable',
   'binding_conflict',
   'credentials_invalid',
   'csrf_failed',
   'too_many_requests',
   'reauth_required',
   'conflict',
   'invalid_request',
   'session_invalid',
   'identity_invalid',
]);

function safeFailure(error: unknown) {
   return error instanceof OAuthFailure && knownErrors.has(error.kind)
      ? error
      : new OAuthFailure('unavailable', 503);
}

/** Preserve only our own business codes, never provider or database exceptions. */
export function toOAuthRpcError(error: unknown) {
   const failure = safeFailure(error);
   const code =
      failure.status === 401
         ? 'UNAUTHORIZED'
         : failure.status === 403
           ? 'FORBIDDEN'
           : failure.status === 409
             ? 'CONFLICT'
             : failure.status === 429
               ? 'TOO_MANY_REQUESTS'
               : failure.status >= 500
                 ? 'SERVICE_UNAVAILABLE'
                 : 'BAD_REQUEST';

   return new TRPCError({
      code,
      message: 'Quanta login could not be completed',
      cause: failure,
   });
}

export function oauthErrorKind(error: unknown) {
   if (
      error instanceof TRPCError &&
      error.cause instanceof OAuthFailure &&
      knownErrors.has(error.cause.kind)
   ) {
      return error.cause.kind;
   }
   return undefined;
}
