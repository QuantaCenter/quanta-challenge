const validToken = (value: unknown): value is string =>
   typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const object = (value: unknown): Record<string, unknown> | null =>
   value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
export const isQuantaLoginPath = (path: string) =>
   /^\/auth\/quanta(?:[/?#]|$)/.test(path);
export const isQuantaProcedure = (path: string) =>
   path.startsWith('auth.quanta.');

export function isQuantaRpcRequest(value: RequestInfo | URL) {
   const input = value instanceof Request ? value.url : String(value);
   try {
      const path = new URL(input, 'https://local.invalid').pathname;
      return (
         path.startsWith('/api/trpc/') &&
         path.slice('/api/trpc/'.length).split(',').some(isQuantaProcedure)
      );
   } catch {
      return false;
   }
}

export function parseAuthorizationResult(
   value: unknown,
   appOrigin: string,
   issuer: string,
) {
   const data = object(value);
   if (
      typeof data?.issuer !== 'string' ||
      typeof data.authorizationUrl !== 'string'
   )
      throw new LoginResponseError();
   // issuer 来自 runtimeConfig（与服务端 QUANTA_OAUTH_ISSUER 同一份配置），
   // 本地开发才允许额外的本地 IdP。
   const issuers = [issuer];
   if (appOrigin === 'https://localhost:3443')
      issuers.push('https://localhost:8443');
   if (!issuers.includes(data.issuer)) throw new LoginResponseError();
   let url: URL;
   try {
      url = new URL(data.authorizationUrl);
   } catch {
      throw new LoginResponseError();
   }
   const query = url.searchParams;
   const singleKeys = [
      'response_type',
      'client_id',
      'redirect_uri',
      'scope',
      'state',
      'nonce',
      'code_challenge',
      'code_challenge_method',
   ];
   const clientIds =
      appOrigin === 'https://localhost:3443'
         ? ['quanta-challenge', 'quanta-challenge-local']
         : ['quanta-challenge'];
   if (
      url.origin !== data.issuer ||
      url.pathname !== '/oauth2/authorize' ||
      url.username ||
      url.password ||
      url.hash ||
      singleKeys.some((key) => query.getAll(key).length !== 1) ||
      query.get('response_type') !== 'code' ||
      !clientIds.includes(query.get('client_id') || '') ||
      query.get('redirect_uri') !== `${appOrigin}/api/auth/quanta/callback` ||
      query.get('scope') !== 'openid profile' ||
      query.get('code_challenge_method') !== 'S256' ||
      !validToken(query.get('state')) ||
      !validToken(query.get('nonce')) ||
      !validToken(query.get('code_challenge'))
   )
      throw new LoginResponseError();
   return url.href;
}
export class LoginResponseError extends Error {
   code = 'session_invalid';
   constructor() {
      super('Invalid Quanta login response');
   }
}
type LoginContext =
   | { status: 'ready' }
   | {
        status: 'onboarding';
        name: string;
        csrfToken: string;
        linkName: string | null;
     };
export function parseLoginContext(value: unknown): LoginContext {
   const data = object(value);
   if (data?.status === 'ready') return { status: 'ready' };
   if (
      data?.status !== 'onboarding' ||
      typeof data.name !== 'string' ||
      !data.name.trim() ||
      !validToken(data.csrfToken) ||
      (data.linkName !== null &&
         (typeof data.linkName !== 'string' || !data.linkName.trim()))
   )
      throw new LoginResponseError();
   return {
      status: 'onboarding',
      name: data.name,
      csrfToken: data.csrfToken,
      linkName: data.linkName as string | null,
   };
}
export function parseSessionResult(value: unknown) {
   const data = object(value);
   if (!validToken(data?.csrfToken) || data?.destination !== '/app/dashboard')
      throw new LoginResponseError();
   return { csrfToken: data.csrfToken, destination: '/app/dashboard' as const };
}
const labels: Record<string, string> = {
   not_enabled: 'Quanta 登录尚未开放，请使用原有方式登录。',
   configuration: 'Quanta 登录配置尚未完成，请联系维护者。',
   expired: '本次登录已过期，请重新发起。',
   access_denied: '你已取消主站授权。',
   member_required: '该登录方式仅向 Quanta 塔员开放。',
   unavailable: '登录服务暂时不可用，请稍后重试。',
   binding_conflict: '账号已存在其他绑定，请联系维护者，不能自动合并。',
   credentials_invalid: '原账号邮箱或密码不正确。',
   csrf_failed: '安全校验失败，请重新发起登录。',
   too_many_requests: '尝试过于频繁，请稍后再试。',
   reauth_required: '原账号验证已过期，请重新发起登录并验证。',
   conflict: '登录状态已发生变化，请重新发起。',
   invalid_request: '本次登录请求无效，请重新发起。',
   session_invalid: '登录状态未能完成初始化，请重新发起。',
};
const restartCodes = new Set([
   'expired',
   'access_denied',
   'csrf_failed',
   'binding_conflict',
   'session_invalid',
   'conflict',
   'reauth_required',
   'invalid_request',
   'member_required',
]);
export function loginError(error: unknown) {
   const value = object(error);
   const data = object(value?.data);
   const code =
      data?.quantaOAuthError ??
      object(data?.data)?.error ??
      data?.error ??
      value?.code;
   return {
      // Object.hasOwn 守卫下 labels[code] 仍是 string | undefined（noUncheckedIndexedAccess），
      // 用 ?? 兜底保证 message 恒为 string
      message:
         (typeof code === 'string' && Object.hasOwn(labels, code)
            ? labels[code]
            : undefined) ?? '登录未完成，请稍后重试。',
      restart: typeof code === 'string' && restartCodes.has(code),
   };
}
