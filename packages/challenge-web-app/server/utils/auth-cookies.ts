import jwt from 'jsonwebtoken';

/**
 * 身份 cookie 的统一设置选项。
 *
 * 历史 bug：此前所有登录/刷新路径设置的都是「会话 cookie」（未写 Expires/Max-Age），
 * 移动端浏览器（iOS Safari、Chrome Android、App 内置 WebView）会在页面关闭、
 * App 切后台或内存回收时激进地丢弃会话 cookie，导致 refresh token cookie
 * 被连带清掉，表现为移动端登录极快过期、/api/refresh 拿不到 cookie 直接 401。
 * PC 浏览器进程长期存活所以侥幸正常。
 *
 * maxAge 直接从 JWT 的 iat/exp 反推：cookie 存活期与 token 实际有效期精确对齐，
 * 环境变量（ACCESS_TOKEN_EXPIRES_IN / REFRESH_TOKEN_EXPIRES_IN）调整时无需同步修改。
 * 每次刷新/续签都会下发新 cookie 并重置 maxAge，即滑动续期。
 */
const REFRESH_TOKEN_FALLBACK_SECONDS = 7 * 24 * 60 * 60;

const maxAgeSecondsFromToken = (
   token: string,
   fallbackSeconds: number,
): number => {
   const payload = jwt.decode(token) as
      | { iat?: number; exp?: number }
      | null;
   if (payload?.iat && payload?.exp && payload.exp > payload.iat) {
      return payload.exp - payload.iat;
   }
   return fallbackSeconds;
};

export const identityCookieOptions = (
   token: string,
   secure: boolean = process.env.NODE_ENV === 'production',
) => ({
   httpOnly: true,
   secure,
   sameSite: 'lax' as const,
   path: '/',
   maxAge: maxAgeSecondsFromToken(token, REFRESH_TOKEN_FALLBACK_SECONDS),
});
