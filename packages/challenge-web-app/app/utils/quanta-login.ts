const validToken = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
export const isQuantaLoginPath = (path: string) => /^\/auth\/quanta(?:[/?#]|$)/.test(path);
export class LoginResponseError extends Error {
   code = 'session_invalid';
   constructor() { super('Invalid Quanta login response'); }
}
type LoginContext = { status: 'ready' } | { status: 'onboarding'; name: string; csrfToken: string; linkName: string | null };
export function parseLoginContext(value: unknown): LoginContext {
   const data = object(value);
   if (data?.status === 'ready') return { status: 'ready' };
   if (data?.status !== 'onboarding' || typeof data.name !== 'string' || !data.name.trim()
      || !validToken(data.csrfToken) || (data.linkName !== null && (typeof data.linkName !== 'string' || !data.linkName.trim()))) throw new LoginResponseError();
   return { status: 'onboarding', name: data.name, csrfToken: data.csrfToken, linkName: data.linkName as string | null };
}
export function parseSessionResult(value: unknown) {
   const data = object(value);
   if (!validToken(data?.csrfToken) || data?.destination !== '/app/dashboard') throw new LoginResponseError();
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
const restartCodes = new Set(['expired', 'access_denied', 'csrf_failed', 'binding_conflict', 'session_invalid', 'conflict', 'reauth_required', 'invalid_request', 'member_required']);
export function loginError(error: unknown) {
   const value = object(error);
   const data = object(value?.data);
   const code = object(data?.data)?.error ?? data?.error ?? value?.code;
   return {
      message: typeof code === 'string' && Object.hasOwn(labels, code) ? labels[code] : '登录未完成，请稍后重试。',
      restart: typeof code === 'string' && restartCodes.has(code),
   };
}
