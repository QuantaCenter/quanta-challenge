import { timingSafeEqual } from 'node:crypto';
import type { AuthInfo } from '@modelcontextprotocol/server';

export function authenticate(
  authorization: string | undefined,
  tokens: ReadonlyMap<string, string>,
): AuthInfo | undefined {
  if (!authorization?.startsWith('Bearer ')) return undefined;
  const supplied = authorization.slice(7);

  for (const [clientId, expected] of tokens) {
    const left = Buffer.from(supplied);
    const right = Buffer.from(expected);
    if (left.length === right.length && timingSafeEqual(left, right)) {
      return {
        token: '[redacted]',
        clientId,
        scopes: ['mcp:read'],
        expiresAt: Math.floor(Date.now() / 1_000) + 86_400,
      };
    }
  }
  return undefined;
}

export function unauthorized(): Response {
  return Response.json(
    { error: 'invalid_token', error_description: '需要有效的 Bearer token' },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="challenge-data-mcp"',
      },
    },
  );
}
